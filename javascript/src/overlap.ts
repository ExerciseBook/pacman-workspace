import {TraceFile, calculateOverlapRate} from './trace/TraceFile.ts'
import {exportProfileChart, makeTraceOverlapOption} from "./trace/echart_intergration.ts";

const oldTrace = '/Users/eric/Downloads/trace_rank64_step4.json';
const newTrace = '/Users/eric/Downloads/torch_prof_aibenchmark_16nodes_tp2_pp2_ep32_etp2_vp1-2025-10-16-1424/trace_rank64_step4.json';

async function processTrace(tracePath: string, outputHtml: string) {
    const traceFile = await TraceFile.load(tracePath);

    const memTrace = traceFile.getMemoryMetrics();

    const calc = traceFile.filterEvent(
        (item) => {
            if (item.cat != "kernel") {
                return false;
            }
            const name = item.name;
            return name.includes("ijk") || name.includes("gemm") ||
                name.includes("conv") || name.includes("matmul") ||
                name.includes("cublas") || name.includes("cudnn") ||
                name.includes("cutlass") || name.includes("gelu") ||
                name.includes("transformer_engine") || name.includes("fused_embedding") ||
                name.includes("forward_kernal") || name.includes("fwd_kernal") ||
                name.includes("quantize") || name.includes("dequantize") ||
                name.includes("triton_poi")
        }
    );

    const comm = traceFile.filterEvent(
        (item) => {
            if (item.cat != "kernel") {
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
}

await processTrace(oldTrace, "output/旧的.html");
await processTrace(newTrace, "output/新的.html");

const trace = await TraceFile.load(oldTrace);
const trace2 = await TraceFile.load(newTrace);

const result = calculateOverlapRate(trace, trace.traceEvents, trace2.traceEvents);

console.log("Torch Kernal 和 NCCL Kernal 的重叠率：" + result.rate);
