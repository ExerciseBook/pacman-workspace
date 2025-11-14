import {TraceFile} from './trace/TraceFile.ts'
import fs from "fs";

const trace = 'I:\\trace\\torch_prof_aibenchmark_16nodes_tp2_pp2_ep32_etp2_vp1-2025-11-03-1442\\trace_rank0_step4.json'
const traceFile = new TraceFile(trace);

const result = traceFile.filterEvent(
    (item) => {
        return item.name.includes("record_param_comms") && item.args["Process Group Description"] == 'EXPERT_TENSOR_PARALLEL_GROUP';
    }
);


const dtypeSize: Record<string, number> = {
    Float: 4, BFloat16: 2, Half: 2, Double: 8, Int: 4, Long: 8, Byte: 1, Bool: 1
};

const header = [
    'timestamp','ts_rel','rank','collective','dtype',
    'in_elems','out_elems','bytes_in','bytes_out','in_MB','out_MB',
    'dur_us','bandwidth_in_MBps','bandwidth_out_MBps',
    'op_id','pair_op_id','group_ranks','group_size','process_group'
].join('\t');

const t0 = traceFile.traceEvents[0]?.ts ?? 0

let tsv = header + "\n"

for (const item of result) {
    const ts = item.ts ?? 0;
    const tsRel = (ts - t0).toFixed(3);
    const dur_us = item.dur ?? 0;               // 原始 trace 里的 dur（同单位）
    const dtype = item.args['dtype'] ?? 'Float';
    const sz = dtypeSize[dtype] ;
    if (!sz) {
        throw new Error(`Unknown dtype size for ${dtype}`)
    }
    const inElems = item.args['In msg nelems'] ?? 0;
    const outElems = item.args['Out msg nelems'] ?? 0;
    const bytesIn = inElems * sz;
    const bytesOut = outElems * sz;
    const inMB = (bytesIn / 1e6).toFixed(2);
    const outMB = (bytesOut / 1e6).toFixed(2);
    const bwIn = dur_us ? (bytesIn / (dur_us / 1e6) / 1e6).toFixed(2) : '';
    const bwOut = dur_us ? (bytesOut / (dur_us / 1e6) / 1e6).toFixed(2) : '';
    const opId = item.args['Ev Idx'] ?? item.args['External id'] ?? '';  // 二选一或都存
    const groupRanks = JSON.stringify(item.args['Process Group Ranks'] ?? []);
    const groupSize = item.args['Group size'] ?? '';
    const pg = item.args['Process Group Name'] ?? item.args['Process Group Description'] ?? '';

    // pair_op_id 需要你在收集阶段建立 map（例如根据 External id 做映射）
    const pairOpId = '';

    tsv += [
        ts.toFixed(3), tsRel, item.args['Rank'], item.args['Collective name'], dtype,
        inElems, outElems, bytesIn, bytesOut, inMB, outMB,
        dur_us, bwIn, bwOut,
        opId, pairOpId, `${groupRanks}`, groupSize, `${pg}`
    ].join('\t') + '\n';
}

console.log(tsv)

// fs.writeFileSync('output/comm.tsv', tsv, {encoding: "utf-8"});
