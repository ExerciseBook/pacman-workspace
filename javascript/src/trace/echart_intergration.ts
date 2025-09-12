import type {OverlapResult, TraceEvent} from "./TraceFile.ts";
import type {Interval} from "./types.ts";
import * as echarts from "echarts/core";
import {eta} from "../template/index.ts"
import fs from "fs";

function renderItem(params, api) {
    const categoryIndex = api.value(0);
    const start = api.coord([api.value(1), categoryIndex]);
    const end = api.coord([api.value(2), categoryIndex]);
    const height = api.size([0, 1])[1] * 0.6;
    const rectShape = echarts.graphic.clipRectByRect(
        {
            x: start[0],
            y: start[1] - height / 2,
            width: end[0] - start[0],
            height: height
        },
        {
            x: params.coordSys.x,
            y: params.coordSys.y,
            width: params.coordSys.width,
            height: params.coordSys.height
        }
    );
    return (
        rectShape && {
            type: 'rect',
            transition: ['shape'],
            shape: rectShape,
            style: api.style()
        }
    );
}

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
                    color: "#75d874"
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