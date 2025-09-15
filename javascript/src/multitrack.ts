import {TraceFile, type TraceEvent} from './trace/TraceFile.ts'
import path from "path";
import fs from "fs";
import {exportProfileChart, makeProfileOption} from "./trace/echart_intergration.ts";

const traceDir = '/Users/eric/Documents/看看trace/开了cudagraph/';

interface ProcessingData {
    trace: TraceFile
    ncclSpan: TraceEvent[]
}

function readTraceFiles(dir: string): ProcessingData[] {
    const files = fs.readdirSync(dir) as string[];
    return files
        .filter(file => (
            (file.includes('trace') || file.includes('track')) &&
            file.endsWith('.json')
        ))
        .map(file => {
            return {
                trace: new TraceFile(path.join(dir, file)),
                ncclSpan: []
            }
        });
}

function extractNcclSpan(data: ProcessingData): void {
    data.ncclSpan = data.trace.filterEvent(
        (item) => {
            if (item.cat != "kernel") {
                return false;
            }
            const name = item.name;
            return name.includes("nccl") && !name.includes("nccl_version");
        }
    );
}


const processingData = readTraceFiles(traceDir);
processingData.forEach(data => extractNcclSpan(data));

const option = makeProfileOption(processingData.map((it) => {
    return {
        trace: it.trace,
        span: it.ncclSpan
    }
}), {
    normalizeTime: true,
})

exportProfileChart(option, "output/multitrack.html");

console.log("done")
