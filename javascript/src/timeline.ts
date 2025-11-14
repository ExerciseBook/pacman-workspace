import {TraceFile} from './trace/TraceFile.ts'

const trace = 'I:\\trace_rank0_step4.json'
const traceFile = new TraceFile(trace);

const result = traceFile.filterEvent(
    (item) => {
        return item.name.includes("record_param_comms") && item.args["Process Group Description"] == 'EXPERT_TENSOR_PARALLEL_GROUP';
    }
);

for (const item of result) {
    console.log(JSON.stringify(item, null, null));
}
//
// 1. 看看专家是否平均
// 2. 统计每一个专家他们传的热点情况
// 3. 直接使用 RCCL 库里的接口，和 torch distribute 对比下性能
