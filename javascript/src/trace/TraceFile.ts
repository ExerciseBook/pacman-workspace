import fs from 'fs'
import type {Interval} from "./types.js";

interface TraceEvent {
    ph: string; // event phase, e.g., 'X'
    bp: string;
    cat: string; // category, e.g., 'cpu_op'
    name: string; // event name, e.g., 'autograd::engine::evaluate_function: MulBackward0'
    id: number; //
    pid: number; // process id
    tid: number; // thread id
    ts?: number; // timestamp (in microseconds or nanoseconds, as provided)
    dur?: number; // duration of the event (in microseconds or nanoseconds)
    args: {
        "External id": number; // external id, e.g., 2049
        "Record function id": number; // function id, e.g., 0
        "Sequence number": number; // sequence number, e.g., 21662
        "Fwd thread id": number; // forward thread id, e.g., 1
        "Ev Idx": number; // event index, e.g., 0
    };
}


interface AggregateResult {
    max: number;
    min: number;
    p95: number;
    p90: number;
    p50: number;
    p10: number;
    p5: number;
}

export class TraceFile {
    traceEvents: TraceEvent[];

    constructor(filePath: string) {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsedData = JSON.parse(data);
        this.traceEvents = parsedData.traceEvents || [];
    }

    private static calculatePercentile(arr: number[], percentile: number): number {
        const sortedArr = arr.sort((a, b) => a - b);
        const index = Math.floor(percentile / 100 * sortedArr.length);
        return sortedArr[index] as number;
    }

    eventsAggregate({filter}: { filter: (item: TraceEvent) => boolean }): AggregateResult | null {
        const filteredEvents = this.traceEvents.filter((item) => {
            if (!isFiniteNum(item.dur)) {
                return false;
            }
            return filter(item);
        });
        const durations = filteredEvents.map(event => event.dur) as number[];

        if (durations.length === 0) {
            return null;
        }

        const max = Math.max(...durations);
        const min = Math.min(...durations);
        const p95 = TraceFile.calculatePercentile(durations, 95);
        const p90 = TraceFile.calculatePercentile(durations, 90);
        const p50 = TraceFile.calculatePercentile(durations, 50);
        const p10 = TraceFile.calculatePercentile(durations, 10);
        const p5 = TraceFile.calculatePercentile(durations, 5);

        return {max, min, p95, p90, p50, p10, p5};
    }

    filterEvent(filter: (item: TraceEvent) => boolean): TraceEvent[] {
        return this.traceEvents.filter(filter);
    }
}


function isFiniteNum(x: any): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

export type Num = number;
export type Interval = [Num, Num];

function normalizeEvents(events: TraceEvent[]): Interval[] {
    const ranges: Interval[] = events
        .filter(e => isFiniteNum(e.ts) && isFiniteNum(e.dur) && (e.dur as number) > 0)
        .map(e => [e.ts as number, (e.ts as number) + (e.dur as number)]);

    if (ranges.length === 0) return [];

    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const merged: Interval[] = [];
    let [cs, ce] = sorted[0] as Interval;

    for (let i = 1; i < sorted.length; i++) {
        const [s, e] = sorted[i] as Interval;
        if (s <= ce) {
            ce = Math.max(ce, e);
        } else {
            merged.push([cs, ce]);
            cs = s;
            ce = e;
        }
    }
    merged.push([cs, ce]);
    return merged;
}

function intervalsIntersection(a: Interval[], b: Interval[]) {
    const inters: Interval[] = [];
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
        const [as, ae] = a[i] as Interval;
        const [bs, be] = b[j] as Interval;
        const s = Math.max(as, bs);
        const e = Math.min(ae, be);
        if (s < e) inters.push([s, e]);
        // 推进较早结束的一侧
        if (ae <= be) i++; else j++;
    }
    const total = inters.reduce((acc, [s, e]) => acc + (e - s), 0);
    return {inters, total};
}

export interface OverlapResult {
    A: Interval[];               // 归并后的 A 区间
    B: Interval[];               // 归并后的 B 区间
    overlapIntervals: Interval[];// A 与 B 的交集区间
    overlapTotal: number;        // 交集总时长
    totalSpan: number;           // 整体时间跨度（来自 trace）
    rate: number;                // overlapTotal / totalSpan

    minTs: number;
    maxTe: number;
}

export function calculateOverlapRate(
    traceFile: TraceFile,
    events1: TraceEvent[],
    events2: TraceEvent[]
): OverlapResult {
    // 1) 计算整个 trace 的时间跨度
    let minTs = Infinity, maxTe = -Infinity;
    for (const e of traceFile.traceEvents) {
        if (isFiniteNum(e.ts) && isFiniteNum(e.dur) && e.dur! > 0) {
            minTs = Math.min(minTs, e.ts!);
            maxTe = Math.max(maxTe, e.ts! + e.dur!);
        }
    }
    const totalSpan = maxTe - minTs;

    // 2) 规范化 A/B（并集归并）
    const A = normalizeEvents(events1);
    const B = normalizeEvents(events2);

    // 3) 没有有效跨度或任一集合为空 → 空结果
    if (!(totalSpan > 0) || A.length === 0 || B.length === 0) {
        return {A, B, overlapIntervals: [], overlapTotal: 0, totalSpan: Math.max(0, totalSpan), rate: 0};
    }

    // 4) 交集
    const {inters, total} = intervalsIntersection(A, B);

    return {
        A,
        B,
        overlapIntervals: inters,
        overlapTotal: total,
        totalSpan,
        rate: total / totalSpan,
        minTs,
        maxTe,
    };
}
