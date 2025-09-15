import type {OverlapResult, TraceEvent} from "./TraceFile.ts";
import type {Interval, ProfilerTrace} from "./types.ts";
import {eta} from "../template/index.ts"
import fs from "fs";

export type EchartTraceOverlapOption = {
    normalizeTime?: boolean; // 是否归一化时间轴到0开始
    memoryTrace?: TraceEvent[];
}

export function makeTraceOverlapOption(data: OverlapResult, cfg: EchartTraceOverlapOption): any {
    const normalizeTime = cfg.normalizeTime ?? true;
    const memoryTrace = cfg.memoryTrace ?? [];

    const startTime = normalizeTime ? 0 : data.minTs
    const endTime = normalizeTime ? (data.maxTe - data.minTs) : data.maxTe

    const spanData = [] as any;

    const getStEt = (interval: Interval): Interval => {
        if (normalizeTime) {
            return [interval[0] - data.minTs, interval[1] - data.minTs];
        } else {
            return interval;
        }
    }

    data.A.forEach(item => {
        let [st, et] = getStEt(item.interval);
        spanData.push({
            name: item.name.join(", "),
            value: [0, st, et, (et - st)],
            itemStyle: {
                normal: {
                    color: "#74d5d8"
                }
            }
        })
    })

    data.B.forEach(item => {
        let [st, et] = getStEt(item.interval);
        spanData.push({
            name: item.name.join(", "),
            value: [1, st, et, (et - st)],
            itemStyle: {
                normal: {
                    color: "#9774d8"
                }
            }
        })
    })

    data.overlapIntervals.forEach(item => {
        let [st, et] = getStEt(item);
        spanData.push({
            name: "Overlap",
            value: [2, st, et, (et - st)],
            itemStyle: {
                normal: {
                    color: "#9c24af"
                }
            }
        })
    })


    return {
        config: {
            startTime: startTime,
            endTime: endTime,
        },
        title: {
            text: 'Profile',
            left: 'center'
        },
        dataZoom: [
            {
                type: 'slider',
                filterMode: 'weakFilter',
                showDataShadow: false,
                top: 400,
                labelFormatter: ''
            },
            {
                type: 'inside',
                filterMode: 'weakFilter'
            }
        ],
        grid: {
            height: 300
        },
        xAxis: {
            min: startTime,
            max: endTime,
            scale: true,
        },
        yAxis: {
            data: ["A", "B", "Overlap"]
        },
        series: [
            {
                type: 'custom',
                renderItem: "RenderItemFN",
                itemStyle: {
                    opacity: 0.8
                },
                encode: {
                    x: [1, 2],
                    y: 0
                },
                data: spanData
            },
            {
                type: 'line',
                name: 'Memory Trace',
                encode: {
                    x: 'x',
                    y: 'y'
                },
                data: memoryTrace.sort((a, b) => {
                    return a.ts! - b.ts!;
                }).map((it) => ([
                    normalizeTime ? (it.ts! - data.minTs) : it.ts,
                    it.args["Total Allocated"] / it.args["Total Reserved"]
                ])),
                lineStyle: {
                    color: '#ff7f50'
                }
            }
        ]
    }
}

export function exportProfileChart(option: any, outputPath: string) {
    const optionData = JSON.stringify(option).replace(/"RenderItemFN"/g, "renderItem");

    const result = eta.render("./profile", {
        option: optionData,
        ...option.config,
    });

    fs.writeFileSync(outputPath, result, {encoding: "utf-8"});
}

function getTimeIntervalFromSpan(span: TraceEvent): Interval {
    const ts = span.ts
    const dur = span.dur
    if (typeof ts !== "number" || isNaN(ts) || typeof dur !== "number" || isNaN(dur) || dur <= 0) {
        throw new Error("Invalid span event: missing or invalid ts/dur");
    }
    return [ts, ts + dur];
}

export function makeProfileOption(data: ProfilerTrace[], cfg: EchartTraceOverlapOption): any {
    const normalizeTime = cfg.normalizeTime ?? true;

    let minTs = Infinity
    let maxTe = -Infinity
    data.forEach(traceItem => {
        traceItem.trace.traceEvents.forEach(eventItem => {
            const newMinTs = eventItem.ts
            const dur = eventItem.dur
            if (typeof newMinTs !== "number" || isNaN(newMinTs) || typeof dur !== "number" || isNaN(dur) || dur <= 0) {
                return;
            }
            const newMaxTe = newMinTs + dur
            if (newMinTs < minTs) {
                minTs = newMinTs
            }
            if (newMaxTe > maxTe) {
                maxTe = newMaxTe
            }
        })
    })

    const startTime = normalizeTime ? 0 : minTs
    const endTime = normalizeTime ? (maxTe - minTs) : maxTe

    const spanData = [] as any;

    const getStEt = (interval: Interval): Interval => {
        if (normalizeTime) {
            return [interval[0] - minTs, interval[1] - minTs];
        } else {
            return interval;
        }
    }

    let initialColorHue = Math.floor(Math.random() * 360);
    const colorStep = Math.floor(360 / (data.length || 1));
    for (let i = 0; i < data.length; i++){
        const dataItem = data[i] !;

        const colorL = 0.7;
        const colocC = 0.1;
        const colorH = (initialColorHue + i * colorStep) % 360;
        const color = `oklch(${colorL} ${colocC} ${colorH})`;

        dataItem.span.forEach(span => {
            const interval = getTimeIntervalFromSpan(span)
            let [st, et] = getStEt(interval);
            spanData.push({
                name: span.name,
                value: [i, st, et, (et - st)],
                itemStyle: {
                    normal: {
                        color: color
                    }
                }
            })
        })
    }


    return {
        config: {
            startTime: startTime,
            endTime: endTime,
        },
        title: {
            text: 'Profile',
            left: 'center'
        },
        dataZoom: [
            {
                type: 'slider',
                filterMode: 'weakFilter',
                showDataShadow: false,
                top: 400,
                labelFormatter: ''
            },
            {
                type: 'inside',
                filterMode: 'weakFilter'
            }
        ],
        grid: {
            height: 300
        },
        xAxis: {
            min: startTime,
            max: endTime,
            scale: true,
        },
        yAxis: {
            data: data.map(item => item.trace.fileName || "Unknown")
        },
        series: [
            {
                type: 'custom',
                renderItem: "RenderItemFN",
                itemStyle: {
                    opacity: 0.8
                },
                encode: {
                    x: [1, 2],
                    y: 0
                },
                data: spanData
            }
        ]
    }
}
