import { TraceFile, type TraceEvent, duplicate } from './trace/TraceFile.ts';
import fs from 'fs';

function getAnnotations(
    events: TraceEvent[],
    overridePid: number,
): TraceEvent[] {
    const ret: TraceEvent[] = [];
    for (const e of events) {
        if (!e.name) continue;

        if (e.name.startsWith("XXXXXXXX:") || e.name.startsWith("nccl:")) {
            const v = duplicate(e);

            const overrideTid = ((cat) => {
                if (cat === "gpu_user_annotation") {
                    return 1;
                }
                if (cat === "user_annotation") {
                    return 0;
                }
                return 3;
            })(e.cat);

            v.pid = overridePid;
            v.tid = overrideTid;
            ret.push(v);
        }
    }
    return ret;
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

        const runTrace = await TraceFile.load(filePath, { idCheck: false });
        const events = getAnnotations(runTrace.traceEvents, rank);

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
        mergedTraceData.save(outPath);
        console.log(`${new Date()}: Generated merged trace ./output/out.json with ${totalEvents} events`);
    } else {
        console.log("${new Date()}: No traces found or merged.");
    }
}

main();
