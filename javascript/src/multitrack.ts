import {TraceFile, type TraceEvent} from './trace/TraceFile.ts'
import path from "path";
import fs from "fs";
import {exportProfileChart, makeProfileOption} from "./trace/echart_intergration.ts";

const traceDir = '/Users/eric/Documents/看看trace/开了cudagraph/';

interface ProcessingData {
    trace: TraceFile
    ncclSpan: TraceEvent[]
}

// 读取某个目录下的 trace 文件，trace 文件为 json 格式
// 返回 ProcessingData 数组
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

// 按照名字提取 NCCL 的 span
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

// 读取 trace 文件
const processingData = readTraceFiles(traceDir);

// 提取 NCCL 的 span 出来
processingData.forEach(data => extractNcclSpan(data));

// 生成图表
const option = makeProfileOption(processingData.map((it) => {
    return {
        trace: it.trace,
        span: it.ncclSpan
    }
}), {
    normalizeTime: true,
})

// 把图表写入文件
exportProfileChart(option, "output/multitrack.html");

console.log("done")
