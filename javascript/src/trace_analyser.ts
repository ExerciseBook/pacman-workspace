import {TraceFile, type TraceEvent, duplicate} from './trace/TraceFile.ts';
import fs from 'fs';

function pickTrace(
    events: TraceEvent[],
    overridePid: number,
): TraceEvent[] {
    const ret: TraceEvent[] = [];
    for (const e of events) {
        if (!e.name) continue;

        if (e.name.startsWith("XXXXXXXX:") || e.name.startsWith("nccl:")) {
            const v = duplicate(e);

            const overrideTid = ((e) => {
                if (e.args?.["dcu.additional_span"] == "true") {
                    return 3;
                }

                const cat = e.cat || "";
                if (cat === "gpu_user_annotation") {
                    return 1;
                }
                if (cat === "user_annotation") {
                    return 0;
                }
                return 3;
            })(e);

            v.args["dcu.original_pid"] = v.pid;
            v.args["dcu.original_tid"] = v.tid;

            v.pid = overridePid;
            v.tid = overrideTid;
            ret.push(v);
        }
    }
    return ret;
}


function rewriteTraceName(span: TraceEvent) {
    const name = span.name;
    if (name.startsWith("XXXXXXXX:")) {
        const paramStr = name.substring("XXXXXXXX:".length).trim();

        try {
            const param = new URLSearchParams(paramStr);
            for (const [key, value] of param.entries()) {
                span.args[`dcu.${key}`] = value
            }
        } catch (error) {
            console.error(`Error parsing parameters from span name: ${name}`, error);
        }
    }
}


function fixTrace(runTrace: TraceFile) {
    const additionalSpans: TraceEvent[] = [];

    // 修复在 backward 阶段的 ncclDevKernel_ReduceScatter_Ring_Simple_Sum_f32，但是没有被 phase=backward&func=mlp_routed_experts 包住的时间
    // 修复目标是让 mlp_routed_experts 的 span 延长到 ReduceScatter 结束

    const reduceScatterSpans: TraceEvent[] = [];

    for (const span of runTrace.traceEvents) {
        rewriteTraceName(span)
        if (span.name == "ncclDevKernel_ReduceScatter_Ring_Simple_Sum_f32(ncclDevKernelArgsStorage<1024ul>)") {
            reduceScatterSpans.push(span)
        }
    }

    const step = reduceScatterSpans.length / 100
    let toNextLog = step

    for (let i = 0; i < reduceScatterSpans.length; i++) {
        if (i >= toNextLog) {
            console.log(`${new Date()}: Processing ReduceScatter spans: ${i}/${reduceScatterSpans.length}`);
            toNextLog += step
        }

        const span = reduceScatterSpans[i]!;

        const spanExternalId = span.args?.["External id"]
        if (!spanExternalId) continue;

        const hipExtLaunchKernelSpan = runTrace.filterEvent(
            (s) => s.name == "hipExtLaunchKernel" && s.args?.["External id"] === spanExternalId
        )
        if (hipExtLaunchKernelSpan.length != 1) {
            console.error(`Expected exactly one mlp span for external_id ${spanExternalId}, but found ${hipExtLaunchKernelSpan.length}`);
            continue
        }

        const cpuStack = runTrace.getParent(hipExtLaunchKernelSpan[0]!);

        // 如果这里包含了 mlp_routed_experts 的 span，那么就要到 gpu timeline 里找到相同的 External Id 然后保证 mlp_routed_experts 的 span 包住了 ReduceScatter 的 span

        if (cpuStack.length == 0) {
            console.error(`Expected non-empty autograd stack for hipExtLaunchKernel span with external_id ${spanExternalId}, but found empty stack`);
            continue
        }

        if (cpuStack[0]!.name == 'ProfilerStep#3') {
            // 第一类要处理的
            if (cpuStack.length < 3) {
                console.error(`Expected autograd stack for hipExtLaunchKernel span with external_id ${spanExternalId} to have at least 3 spans, but found ${cpuStack.length}`);
                continue
            }

            const cpuForwardBackwardStepSpan = cpuStack[1]
            if (cpuForwardBackwardStepSpan?.args["dcu.func"] != 'forward_backward_step') {
                console.error(`Expected second span in autograd stack to be forward_backward_step for hipExtLaunchKernel span with external_id ${spanExternalId}, but found ${cpuStack[1]!.name}`);
                continue
            }

            const cpuForwardMlpRoutedExpertsSpan = cpuStack[2]
            if (cpuForwardMlpRoutedExpertsSpan?.args["dcu.phase"] != 'forward' || cpuForwardMlpRoutedExpertsSpan?.args["dcu.func"] != 'mlp_routed_experts') {
                console.error(`Expected third span in autograd stack to be mlp_routed_experts with forward phase for hipExtLaunchKernel span with external_id ${spanExternalId}, but found ${cpuStack[2]!.name} with phase ${cpuStack[2]!.args["dcu.phase"]} and func ${cpuStack[2]!.args["dcu.func"]}`);
                continue
            }

            const forwardMlpRoutedExpertsSpanExternalId = cpuForwardMlpRoutedExpertsSpan.args?.["External id"]
            if (!forwardMlpRoutedExpertsSpanExternalId) {
                console.error(`Expected External id in mlp_routed_experts span for hipExtLaunchKernel span with external_id ${spanExternalId}, but not found`);
                continue
            }

            const gpuForwardMlpRoutedExpertsSpan = runTrace.filterEvent(
                (s) => s.tid == 0 && s.args?.["External id"] === forwardMlpRoutedExpertsSpanExternalId
            )
            if (gpuForwardMlpRoutedExpertsSpan.length != 1) {
                console.error(`Expected exactly one gpu mlp_routed_experts span with External id ${forwardMlpRoutedExpertsSpanExternalId} corresponding to cpu mlp_routed_experts span for hipExtLaunchKernel span with external_id ${spanExternalId}, but found ${gpuForwardMlpRoutedExpertsSpan.length}`);
                continue
            }
            gpuForwardMlpRoutedExpertsSpan.forEach(
                (s) => {
                    if (s.name.startsWith("XXXXXXXX:")) {

                        const spanToAdd = duplicate(s)
                        spanToAdd.ts = span.ts !
                        spanToAdd.dur = span.dur !
                        spanToAdd.args['dcu.additional_span'] = 'true'

                        additionalSpans.push(spanToAdd)
                    }
                }
            )
        } else if (cpuStack[0]!.args["dcu.func"] == 'mlp_routed_experts') {
            const autoGradSpan = cpuStack[1]
            if (typeof autoGradSpan === "undefined") {
                console.error(`Expected autograd::engine span as parent of mlp_routed_experts span for external_id ${spanExternalId}, but found no parent span`);
                continue
            }

            if (!autoGradSpan.name.startsWith("autograd::engine")) {
                console.error(`Expected top of autograd stack to be autograd::engine for hipExtLaunchKernel span with external_id ${spanExternalId}, but found ${cpuStack[0]!.name}`);
                continue
            }

            const gatherFromSequenceParallelRegionBackwardSpan = cpuStack.filter(
                (s) => s.name === "_GatherFromSequenceParallelRegionBackward"
            )
            if (gatherFromSequenceParallelRegionBackwardSpan.length != 1) {
                console.error(`Expected exactly one _GatherFromSequenceParallelRegionBackward span in autograd stack for hipExtLaunchKernel span with external_id ${spanExternalId}, but found ${gatherFromSequenceParallelRegionBackwardSpan.length}`);
                continue
            }

            const gatherFromSequenceParallelRegionBackwardSequenceNumber = gatherFromSequenceParallelRegionBackwardSpan[0]!.args?.["Sequence number"]
            if (!gatherFromSequenceParallelRegionBackwardSequenceNumber) {
                console.error(`Expected External id in _GatherFromSequenceParallelRegionBackward span for sequence number ${gatherFromSequenceParallelRegionBackwardSequenceNumber}, but not found`);
                continue
            }

            const gatherFromSequenceParallelRegionSpan = runTrace.filterEvent(
                (s) => s.name == "_GatherFromSequenceParallelRegion" && s.args?.["Sequence number"] === gatherFromSequenceParallelRegionBackwardSequenceNumber
            )
            if (gatherFromSequenceParallelRegionSpan.length != 1) {
                console.error(`Expected exactly one span with External id ${gatherFromSequenceParallelRegionBackwardSequenceNumber} corresponding to _GatherFromSequenceParallelRegionBackward span for hipExtLaunchKernel span with external_id ${spanExternalId}, but found ${gatherFromSequenceParallelRegionSpan.length}`);
                continue
            }
            const gatherFromSequenceParallelRegionSpanStack = runTrace.getParent(gatherFromSequenceParallelRegionSpan[0]!)

            const cpuMlpRoutedExpertsSpan = gatherFromSequenceParallelRegionSpanStack.filter(
                (s) => s.args?.["dcu.func"] == 'mlp_routed_experts'
            )
            if (cpuMlpRoutedExpertsSpan.length != 1) {
                console.error(`Expected exactly one mlp_routed_experts span in autograd stack for hipExtLaunchKernel span with external_id ${spanExternalId}, but found ${cpuMlpRoutedExpertsSpan.length}`);
                continue
            }
            const cpuMlpRoutedExpertsSpanExternalId = cpuMlpRoutedExpertsSpan[0]!.args?.["External id"]

            const gpuMlpRoutedExpertsSpan = runTrace.filterEvent(
                (s) => s.tid == 0 && s.args?.["External id"] === cpuMlpRoutedExpertsSpanExternalId
            )
            if (gpuMlpRoutedExpertsSpan.length != 1) {
                console.error(`Expected exactly one gpu mlp_routed_experts span with External id ${cpuMlpRoutedExpertsSpanExternalId} corresponding to cpu mlp_routed_experts span for hipExtLaunchKernel span with external_id ${spanExternalId}, but found ${gpuMlpRoutedExpertsSpan.length}`);
                continue
            }


            const gpuMlpRoutedExpertsSpanStack = runTrace.getParent(gpuMlpRoutedExpertsSpan[0]!)
            if (gpuMlpRoutedExpertsSpanStack.length != 3) {
                console.warn(`Expected gpu mlp_routed_experts span with External id ${cpuMlpRoutedExpertsSpanExternalId} to have a stack of length 3, but found ${gpuMlpRoutedExpertsSpanStack.length}`);
            }
            gpuMlpRoutedExpertsSpanStack.forEach(
                (s) => {
                    if (s.name.startsWith("XXXXXXXX:")) {

                        const spanToAdd = duplicate(s)
                        spanToAdd.ts = span.ts !
                        spanToAdd.dur = span.dur !
                        spanToAdd.args['dcu.additional_span'] = 'true'

                        if (spanToAdd.args['dcu.func'] == 'mlp_routed_experts') {
                            spanToAdd.args['dcu.phase'] = 'backward'
                            spanToAdd.name = spanToAdd.name.replace("phase=forward", "phase=backward")
                        }

                        additionalSpans.push(spanToAdd)
                    }
                }
            )
        } else {
            console.error(JSON.stringify(cpuStack[0]!));
        }
    }


    additionalSpans.forEach(s => runTrace.addTraceEventNoCheck(s))
}

async function main() {
    const args = process.argv.slice(2);

    let start = 0;
    let end = 512;
    let step = 64;
    let pathPrefix = '';

    if (args.length > 0) {
        pathPrefix = args[0] as string;
    } else {
        console.log(`Usage: ts-node ${process.argv[1]} <path_prefix> [rank_start=${start}] [end=${end}] [step=${step}]`);
        console.log(`Example: ts-node ... /data/logs/`);
        process.exit(0);
    }

    if (args.length > 1) start = parseInt(args[1] as string, 10);
    if (args.length > 2) end = parseInt(args[2] as string, 10);
    if (args.length > 3) step = parseInt(args[3] as string, 10);

    let mergedTraceData: TraceFile | null = null;
    let totalEvents = 0;

    for (let rank = start; rank < end; rank += step) {
        let filePath = pathPrefix + `/trace_rank${rank}_step4.json`;

        console.log(`${new Date()}: now processing ${filePath}`)

        if (!fs.existsSync(filePath)) {
            continue;
        }

        const runTrace = await TraceFile.load(filePath, {idCheck: false});
        fixTrace(runTrace)

        // await runTrace.save(`output/processed_rank${rank}_step4.json`)

        const events = pickTrace(runTrace.traceEvents, rank);

        if (mergedTraceData === null) {
            // Use this as template even if no events matched, to capture metadata
            // But better if we have events, or just take first file found.
            mergedTraceData = runTrace.emptyEventFile();
        }

        if (mergedTraceData) {
            events.forEach(e => {
                mergedTraceData!.addTraceEventNoCheck(e);
            });
            totalEvents += events.length;
            console.log(`${new Date()}: Imported ${events.length} events from ${filePath}`);
        }
    }

    if (mergedTraceData) {
        const outPath = "output/out.json";
        await mergedTraceData.save(outPath);
        console.log(`${new Date()}: Generated merged trace ./output/out.json with ${totalEvents} events`);
    } else {
        console.log("${new Date()}: No traces found or merged.");
    }
}

await main();
