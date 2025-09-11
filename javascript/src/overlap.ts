import {TraceFile, calculateOverlapRate} from './trace/TraceFile.ts'
import {exportProfileChart, makeTraceOverlapOption} from "./trace/echart_intergration.ts";

const oldTrace = '/Users/eric/Documents/看看trace/没开cudagraph/trace_rank0_step4.json';
const newTrace = '/Users/eric/Documents/看看trace/开了cudagraph/trace_rank0_step4.json';

function processTrace(tracePath: string, outputHtml: string) {
    const traceFile = new TraceFile(tracePath);

    const calc = traceFile.filterEvent(
        (item) => {
            return item.name.includes("aten::");
        }
    );

    const comm = traceFile.filterEvent(
        (item) => {
            const name = item.name;
            return name.includes("nccl") && !name.includes("nccl_version");
        }
    );

    const result = calculateOverlapRate(traceFile, calc, comm);
    const option = makeTraceOverlapOption(result);

    exportProfileChart(option, outputHtml);

    console.log(result.rate);
    console.log(result.B.reduce((acc, cnt) => acc + cnt.interval[1] - cnt.interval[0], 0) / (result.maxTe - result.minTs));
}

processTrace(oldTrace, "output/没开cudagraph.html");
processTrace(newTrace, "output/开了cudagraph.html");
