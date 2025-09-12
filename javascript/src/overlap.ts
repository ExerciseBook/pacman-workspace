import {TraceFile, calculateOverlapRate} from './trace/TraceFile.ts'
import {exportProfileChart, makeTraceOverlapOption} from "./trace/echart_intergration.ts";

const oldTrace = '/Users/eric/Documents/看看trace/没开cudagraph/trace_rank0_step4.json';
const newTrace = '/Users/eric/Documents/看看trace/开了cudagraph/trace_rank0_step4.json';

function processTrace(tracePath: string, outputHtml: string) {
    const traceFile = new TraceFile(tracePath);

    const memTrace = traceFile.getMemoryMetrics();

    const calc = traceFile.filterEvent(
        (item) => {
            if　(item.cat != "kernel") {
                return false;
            }
            const name = item.name;
            return name.includes("ijk") || name.includes("gemm") || name.includes("conv") || name.includes("matmul");
        }
    );

    const comm = traceFile.filterEvent(
        (item) => {
            if　(item.cat != "kernel") {
                return false;
            }
            const name = item.name;
            return name.includes("nccl") && !name.includes("nccl_version");
        }
    );

    const result = calculateOverlapRate(traceFile, calc, comm);
    const option = makeTraceOverlapOption(result, {
        normalizeTime: true,
        memoryTrace: memTrace,
    });

    exportProfileChart(option, outputHtml);

    console.log("Torch Kernal 和 NCCL Kernal 的重叠率：" + result.rate);
}

console.log("没有开启 cudagraph 的情况：");
processTrace(oldTrace, "output/没开cudagraph.html");
console.log("====================================");
console.log("开启 cudagraph 的情况：");
processTrace(newTrace, "output/开了cudagraph.html");
