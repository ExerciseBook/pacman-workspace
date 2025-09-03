import type {OverlapResult} from "./TraceFile.js";
import type {Interval} from "./types.js";
import * as echarts from "echarts/core";

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

export function makeTraceOverlapOption(data: OverlapResult): any {
    const startTime = data.minTs

    const spanData = [] as any;

    data.A.forEach(item => {
        let [st, et] = item;
        spanData.push({
            name: "计算",
            value: [0, st, et, (et - st)],
            itemStyle: {
                normal: {
                    color: "#75d874"
                }
            }
        })
    })

    data.B.forEach(item => {
        let [st, et] = item;
        spanData.push({
            name: "通信",
            value: [1, st, et, (et - st)],
            itemStyle: {
                normal: {
                    color: "#9774d8"
                }
            }
        })
    })

    data.overlapIntervals.forEach(item => {
        let [st, et] = item;
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
        tooltip: {
            formatter: function (params) {
                return params.marker + params.name + ': ' + params.value[3] + ' ms';
            }
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
            scale: true,
            axisLabel: {
                formatter: function (val) {
                    return Math.max(0, val - startTime) + ' ms';
                }
            }
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
            }
        ]
    }
}
