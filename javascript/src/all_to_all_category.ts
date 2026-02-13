import {type TraceEvent, TraceFile} from './trace/TraceFile.ts'

const trace = 'C:\\Users\\mo\\work\\pacman-workspace\\javascript\\data\\ep\\ep8\\torch_prof_aibenchmark_tp2_pp1_ep8_etp1_vp\\trace_rank0_step11.json'
const traceFile = new TraceFile(trace);

function getStack(event: TraceEvent): any {
    const externalId = event.args["External id"]

    const markers = traceFile.filterEvent(s => !!s.args && s.args["External id"] == externalId && s.cat == "user_annotation");
    if (markers.length != 1) {
        throw new Error(`Expected exactly one user_annotation event with External id ${externalId}, but found ${s.length}`);
    }

    const marker = markers[0]!;

    if (!marker.ts) {
        throw new Error(`Marker event does not have a timestamp`);
    }

    return traceFile.getParent(marker)
}

const result = traceFile.filterEvent(
    (item) => {
        return item.name == "nccl:all_to_all" && item.cat == 'gpu_user_annotation'
    }
);

// for (let item of result) {
//     const s = getStack(item);
// }

console.log(getStack(result[5]).map(s => s.name))

// console.log(result);