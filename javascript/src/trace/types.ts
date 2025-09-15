import {type TraceEvent, TraceFile} from "./TraceFile.ts";

export type Num = number;
export type Interval = [Num, Num];
export type ProfilerTrace = {
    trace: TraceFile
    span: TraceEvent[]
}
