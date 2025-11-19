import {TraceFile} from './trace/TraceFile.ts'
import fs from "fs";


function extractCommEvents(traceFile: TraceFile) {

    const getMarkers = (cat) => {
        const t = traceFile.filterEvent(
            (item) => {
                return item.name.startsWith("XXXXXXXX:") && item.cat == cat;
            }
        ).map(it => {
            const args = new URLSearchParams(it.name.substring("XXXXXXXX:".length).trim());

            const layer = args.get("MoeLayer");
            return {layer, span: it};
        }).map(it => {
            return {
                marker: it,
                param: [],
                kernals: [],
            }
        });

        const groupCounter = {};
        for (let item of t) {
            const tid = item.marker.span.tid
            groupCounter[tid] = (groupCounter[tid] || 0) + 1;
        }

        const targetTid = []
        for (let key in groupCounter) {
            if (groupCounter[key] == 32) {
                targetTid.push(key);
            }
        }

        return t.filter(it => it.marker.span.tid == targetTid[0]);
    };
    const cpuMarkers = getMarkers('user_annotation')
    const gpuMarkers = getMarkers('gpu_user_annotation')

    const hipKernelSpan = traceFile.filterEvent(
        (item) => {
            return item.name.includes("hipExtLaunchKernel") &&
                item.args["kernel"]?.includes("ncclDevKernel_Generic_4") &&
                item.cat == 'cuda_runtime';
        }
    );
    const ncclAllToALlSpan = traceFile.filterEvent(
        (item) => {
            return item.name.includes("nccl:all_to_all") && item.cat == 'user_annotation';
        }
    );
    const ncclKernalSpan = traceFile.filterEvent(
        (item) => {
            return item.cat == "kernel" && item.name.includes("ncclDevKernel_Generic_4");
        }
    );

    const ncclRecordParamCommsSpan = traceFile.filterEvent(
        (item) => {
            return item.name.includes("record_param_comms") && item.cat == 'cpu_op';
        }
    );

    const ret = []
    for (let idx = 0; idx < gpuMarkers.length; idx++) {
        const cpuItem = cpuMarkers[idx];
        const gpuItem = gpuMarkers[idx];

        const cpuTs = (cpuItem.marker.span.ts);
        const cpuEt = (cpuItem.marker.span.ts + cpuItem.marker.span.dur);

        const ncclAllToAllSpans = ncclAllToALlSpan.filter(it => {
            const st = it.ts ?? 0;
            const dur = it.dur ?? 0;
            const et = st + dur;
            return st >= cpuTs && et <= cpuEt;
        });
        if (ncclAllToAllSpans.length != 1) {
            throw new Error("")
        }
        const ncclAllToAllSpan = ncclAllToAllSpans[0]

        const enclosing = ncclRecordParamCommsSpan.filter(s => {
            const sSt = s.ts ?? 0;
            const sEt = sSt + (s.dur ?? 0);
            const aSt = ncclAllToAllSpan.ts ?? 0;
            const aEt = aSt + (ncclAllToAllSpan.dur ?? 0);
            return sSt <= aSt && sEt >= aEt;
        });
        if (enclosing.length === 0) {
            cpuItem.param = [];
        } else {
            const best = enclosing.reduce((min, cur) => {
                const minDur = (min.dur ?? 0);
                const curDur = (cur.dur ?? 0);
                return curDur < minDur ? cur : min;
            }, enclosing[0]);
            cpuItem.param = [best];
        }

        //
        // const gpuTs = (gpuItem.marker.span.ts);
        // const gpuEt = (gpuItem.marker.span.ts + gpuItem.marker.span.dur);
        //
        // const ncclSpans = ncclKernalSpan.filter((it) => {
        //     const st = it.ts ?? 0;
        //     const dur = it.dur ?? 0;
        //     const et = st + dur;
        //     return st >= gpuTs && et <= gpuEt
        // })

        const filteredNcclSpans = ncclKernalSpan.filter(it => {
            return   it.args["External id"] == cpuItem.param[0].args["External id"];
        })
        if (filteredNcclSpans.length!= 5) {
            throw new Error("Filtered nccl span length is not 5");
        }

        cpuItem.kernals = filteredNcclSpans;

        ret.push(cpuItem);
    }

    return ret;
}

function getUniqueId(ids: number[]) {
    // check is all ids are same
    const firstId = ids[0];
    for (let id of ids) {
        if (id !== firstId) {
            throw new Error("Not all ids are same");
        }
    }
    return firstId;
}


for (let rank = 0; rank < 128; rank++) {
    const trace = `I:\\trace\\torch_prof_aibenchmark_16nodes_tp2_pp2_ep32_etp2_vp1-2025-11-13-2323\\trace_rank${rank}_step4.json`
    if (!fs.existsSync(trace)) {
        console.warn(`Trace file for rank ${rank} does not exist: ${trace}`);
        continue;
    }
    const traceFile = new TraceFile(trace);
    const t = extractCommEvents(traceFile);
    fs.writeFileSync(`output/comm1/comm_rank${rank}_step4.json`, JSON.stringify(t, null, 4), {encoding: "utf-8"});
    console.log("Extracted comm events for rank ", rank);
}
