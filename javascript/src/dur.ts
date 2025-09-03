import TraceFile from './trace/TraceFile.ts'

const oldTrace =  '/Users/eric/Downloads/torch_prof_aibenchmark_8nodes_tp4-pp2-ep8-etp2-cp1-vp2-08291738/trace_rank4_step4.json'
const newTrace = '/Users/eric/Downloads/torch_prof_aibenchmark_8nodes_tp4-pp2-ep8-etp2-cp1-vp2/未命名/trace_rank4_step4.json'
const traceFile = new TraceFile(oldTrace);

const result = traceFile.eventsAggregate({
    filter: (item) => item.name === "_AllToAll"
});

console.log(result);
console.log(JSON.stringify(result));
