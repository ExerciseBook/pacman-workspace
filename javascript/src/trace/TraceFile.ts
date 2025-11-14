import fs from 'fs'
import type {Interval} from "./types.js";
import path from "path";

export interface TraceEvent {
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
        "Total Allocated": number; // external id, e.g., 2049
        "Total Reserved": number; // external id, e.g., 2049
        "External id": number; // external id, e.g., 2049
        "Record function id": number; // function id, e.g., 0
        "Sequence number": number; // sequence number, e.g., 21662
        "Fwd thread id": number; // forward thread id, e.g., 1
        "Ev Idx": number; // event index, e.g., 0

        "Process Group Description": string; // name == record_param_comms
        "dtype": string;
        "In msg nelems": number;
        "Out msg nelems": number;
        "Process Group Ranks": number[];
        "Group size": number;
        "Process Group Name": string;
        "Collective name": string;
        "Rank": number;
    };
}


export interface AggregateResult {
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
    path: string;
    fileName: string;

    constructor(filePath: string) {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsedData = JSON.parse(data);
        this.traceEvents = parsedData.traceEvents || [];
        this.path = filePath;
        this.fileName = path.basename(filePath);
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

    getMemoryMetrics() {
        return this.traceEvents.filter(e => e.cat === 'cpu_instant_event' && e.name === '[memory]');
    }
}


function isFiniteNum(x: any): x is number {
    return typeof x === "number" && Number.isFinite(x);
}


export interface NamedIntervalSegment {
    name: string[];    // 这个时间片内活跃的事件名去重后的集合
    interval: Interval;// [start, end)
}

function normalizeEvents(events: TraceEvent[]): NamedIntervalSegment[] {
    type Endpoint = { t: number; kind: 1 | -1; name: string };

    // 1) 过滤并生成端点
    const endpoints: Endpoint[] = [];
    for (const e of events) {
        if (isFiniteNum(e.ts) && isFiniteNum(e.dur) && e.dur! > 0) {
            const s = e.ts as number;
            const te = s + (e.dur as number);
            endpoints.push({t: s, kind: 1, name: e.name});
            endpoints.push({t: te, kind: -1, name: e.name});
        }
    }
    if (endpoints.length === 0) return [];

    // 2) 按时间排序；同一时间点：开始在前、结束在后
    endpoints.sort((a, b) => (a.t === b.t ? b.kind - a.kind : a.t - b.t));

    // 3) 扫描线
    const active = new Map<string, number>(); // name -> 计数（同名事件可能重叠）
    const out: NamedIntervalSegment[] = [];
    let i = 0;
    let prevT: number | null = null;

    while (i < endpoints.length) {
        const curT = endpoints[i]!.t;

        // 在 [prevT, curT) 之间输出一个片段（若有活跃集合）
        if (prevT !== null && curT > prevT && active.size > 0) {
            const names = Array.from(active.keys()).sort();
            const last = out[out.length - 1];
            // 与上一个片段 name 集合相同则合并
            if (
                last &&
                last.interval[1] === prevT &&
                last.name.length === names.length &&
                last.name.every((n, idx) => n === names[idx])
            ) {
                last.interval[1] = curT;
            } else {
                out.push({name: names, interval: [prevT, curT]});
            }
        }

        // 把同一时间点的所有端点一次处理完
        while (i < endpoints.length && endpoints[i]!.t === curT) {
            const {kind, name} = endpoints[i]!;
            if (kind === 1) {
                active.set(name, (active.get(name) ?? 0) + 1);
            } else {
                const cnt = (active.get(name) ?? 0) - 1;
                if (cnt <= 0) active.delete(name);
                else active.set(name, cnt);
            }
            i++;
        }
        prevT = curT;
    }

    return out;
}

function mergeIntervalsFromSegments(segs: NamedIntervalSegment[]): Interval[] {
    if (segs.length === 0) return [];
    const ranges = segs.map(s => s.interval).filter(([s, e]) => e > s);
    if (ranges.length === 0) return [];

    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
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

export interface OverlapResult {
    A: NamedIntervalSegment[];               // 归并后的 A 区间
    B: NamedIntervalSegment[];               // 归并后的 B 区间
    overlapIntervals: Interval[];// A 与 B 的交集区间
    overlapTotal: number;        // 交集总时长
    totalSpan: number;           // 整体时间跨度（来自 trace）
    rate: number;                // overlapTotal / totalSpan

    minTs: number;
    maxTe: number;
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

    // 2) 规范化 A/B（带名字的分段 => 合并成并集区间）
    const A_segments = normalizeEvents(events1);
    const B_segments = normalizeEvents(events2);
    const A = mergeIntervalsFromSegments(A_segments);
    const B = mergeIntervalsFromSegments(B_segments);

    // 3) 没有有效跨度或任一集合为空 → 空结果
    if (!(totalSpan > 0) || A.length === 0 || B.length === 0) {
        return {
            A: A_segments,
            B: B_segments,
            overlapIntervals: [],
            overlapTotal: 0,
            totalSpan: Math.max(0, totalSpan),
            rate: 0,
            minTs,
            maxTe
        };
    }

    // 4) 交集
    const {inters, total} = intervalsIntersection(A, B);

    return {
        A: A_segments,
        B: B_segments,
        overlapIntervals: inters,
        overlapTotal: total,
        totalSpan,
        rate: total / totalSpan,
        minTs,
        maxTe,
    };
}
