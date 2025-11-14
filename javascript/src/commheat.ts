import {type TraceEvent, TraceFile} from './trace/TraceFile.ts'
import fs from "fs";


function extractCommEvents(traceFile: TraceFile) {
    const marker = traceFile.filterEvent(
        (item) => {
            return item.name.startsWith("XXXXXXXX:")
        }
    ).map(it => {
        const args = new URLSearchParams(it.name.substring("XXXXXXXX:".length).trim());

        const layer = args.get("MoeLayer");
        return {layer, span: it};
    });


    const x = {}
    for (let item of marker) {
        if (!(item.layer in x)) {
            x[item.layer] = {
                marker: item,
                span: [],
                param: [],
            };
        }
    }

    const hipKernelSpan = traceFile.filterEvent(
        (item) => {
            return item.name.includes("hipExtLaunchKernel") && item.args["kernel"]?.includes("ncclDevKernel_Generic_4");
        }
    );
    const ncclKernalSpan = traceFile.filterEvent(
        (item) => {
            return item.cat == "kernel" && item.name.includes("ncclDevKernel_Generic_4");
        }
    );

    const ncclRecordParamCommsSpan = traceFile.filterEvent(
        (item) => {
            return item.name.includes("record_param_comms");
        }
    );

    for (let key of Object.keys(x)) {
        const item = x[key];

        const markerTs = (item.marker.span.ts);
        const markerEt = (item.marker.span.ts + item.marker.span.dur);

       const  filteredHipKernalSpan = hipKernelSpan.filter(it => {
            const st = it.ts ?? 0;
            const dur = it.dur ?? 0;
            const et = st + dur;
            return st >= markerTs && et <= markerEt;
        });

        const externalId = filteredHipKernalSpan.map((it) => it.args["External id"])
        const uniqueExternalId = getUniqueId(externalId)

        item.span = ncclKernalSpan.filter(it =>  it.args["External id"] == uniqueExternalId  );
        item.param =ncclRecordParamCommsSpan.filter(it =>  it.args["External id"] == uniqueExternalId  );
    }

    return x;
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


const commMap: {
    [key: number]: TraceEvent[]
} = {}

for (let rank = 0; rank < 128; rank++) {
    const trace = `I:\\trace\\torch_prof_aibenchmark_16nodes_tp2_pp2_ep32_etp2_vp1-2025-11-13-2323\\trace_rank${rank}_step4.json`
    if (!fs.existsSync(trace)) {
        console.warn(`Trace file for rank ${rank} does not exist: ${trace}`);
        continue;
    }
    const traceFile = new TraceFile(trace);
    commMap[rank] = extractCommEvents(traceFile);
    console.log("Extracted comm events for rank ", rank);
}
