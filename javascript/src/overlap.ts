import {TraceFile, calculateOverlapRate} from './trace/TraceFile.ts'
import {makeTraceOverlapOption} from "./trace/echart_intergration.ts";

const oldTrace = '/Users/eric/Downloads/torch_prof_aibenchmark_8nodes_tp4-pp2-ep8-etp2-cp1-vp2-08291738/trace_rank4_step4.json'
const newTrace = '/Users/eric/Downloads/torch_prof_aibenchmark_8nodes_tp4-pp2-ep8-etp2-cp1-vp2/未命名/trace_rank4_step4.json'
const traceFile = new TraceFile(newTrace);

const calc = traceFile.filterEvent(
    (item) => {
        return item.name.includes("ijk");
    }
);

const comm = traceFile.filterEvent(
    (item) => {
        return item.name.includes("nccl");
    }
);

const result = calculateOverlapRate(traceFile, calc, comm)

const option = makeTraceOverlapOption(result)

console.log(JSON.stringify(option).replace(/"RenderItemFN"/g, "renderItem"))
