import fs from 'fs';
import readline from 'readline';
import {TraceFile, type TraceEvent} from './trace/TraceFile.ts';
import type {ProfilerTrace} from './trace/types.ts';
import {makeProfileOption, exportProfileChart} from './trace/echart_intergration.ts';

export interface Result {
    rank: string | number;
    spans: {
        action: string;
        startTime: number;
        duration: number;
        endTime: number;
        nonce: string;
    }[];
}

interface LogEntry {
    rank?: number;
    action: string;
    type: 'start' | 'end';
    time: number;
    nonce: string;
    hexId: string;
}

export async function parseLogFile(filePath: string): Promise<Result[]> {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    // Map nonce to list of events for that nonce
    const eventsByNonce = new Map<string, LogEntry[]>();

    // Map identifier (from log prefix) to rank number from JSON payload
    const hexIdToRank = new Map<string, number>();

    for await (const line of rl) {
        if (!line.includes('😐')) continue;

        // Line format example:
        // 2026-02-06T16:17:32+0800  a09r3n09 600cf856  😐: {"rank": 0, ...}
        const parts = line.split('😐:');
        if (parts.length < 2) continue;

        const metadata = parts[0].trim();
        const jsonStr = parts[1].trim();

        // Extract identifying hex string (e.g. 600cf856) from metadata
        const metaParts = metadata.split(/\s+/);
        const hexId = metaParts[metaParts.length - 1];

        try {
            const raw = JSON.parse(jsonStr);
            const entry: LogEntry = {
                rank: raw.rank,
                action: raw.action,
                type: raw.type,
                time: raw.time,
                nonce: raw.nonce,
                hexId: hexId // Store hexId to resolve rank later if needed
            };

            // Group by nonce
            if (!eventsByNonce.has(entry.nonce)) {
                eventsByNonce.set(entry.nonce, []);
            }
            eventsByNonce.get(entry.nonce)!.push(entry);

            // Learn rank mapping if present
            if (entry.rank !== undefined && !hexIdToRank.has(hexId)) {
                hexIdToRank.set(hexId, entry.rank);
            }
        } catch (e) {
            console.warn(`Skipping invalid JSON line: ${line.substring(0, 100)}...`);
        }
    }

    const spansByRank = new Map<string | number, Result['spans']>();

    for (const [nonce, events] of eventsByNonce) {
        // Sort by time
        events.sort((a, b) => a.time - b.time);

        const starts: LogEntry[] = [];
        const ends: LogEntry[] = [];

        for (const e of events) {
            if (e.type === 'start') starts.push(e);
            else if (e.type === 'end') ends.push(e);
        }

        // Simple matching: assume 1 start and 1 end per nonce usually,
        // but handle multiple if nonce is reused (though nonce implies unique).
        // If nonce is unique per pair, we just take the first start and first end.

        // However, if we have muliple pairs with same nonce (bad practice but possible),
        // we should match them up.
        // Given 'events' is sorted by time: S1, E1, S2, E2...

        const openStack: LogEntry[] = [];

        for (const event of events) {
            if (event.type === 'start') {
                openStack.push(event);
            } else if (event.type === 'end') {
                if (openStack.length > 0) {
                    const startEvent = openStack.pop()!;

                    // Determine rank
                    let rank: string | number | undefined;

                    // 1. Explicit rank in start or end
                    if (startEvent.rank !== undefined) rank = startEvent.rank;
                    else if (event.rank !== undefined) rank = event.rank;

                    // 2. Inferred from hexId
                    if (rank === undefined) {
                        if (hexIdToRank.has(startEvent.hexId)) rank = hexIdToRank.get(startEvent.hexId);
                        else if (hexIdToRank.has(event.hexId)) rank = hexIdToRank.get(event.hexId);
                        else rank = startEvent.hexId; // Fallback to hexId
                    }

                    if (rank !== undefined) {
                        if (!spansByRank.has(rank)) {
                            spansByRank.set(rank, []);
                        }

                        spansByRank.get(rank)!.push({
                            action: startEvent.action,
                            startTime: startEvent.time,
                            endTime: event.time,
                            duration: event.time - startEvent.time,
                            nonce: nonce
                        });
                    }
                }
            }
        }
    }

    const results: Result[] = [];
    for (const [rank, spans] of spansByRank) {
        const isNetwork = (span) =>
            !span.action.includes("model schedule") &&
            !span.action.includes("autograd") &&
            !span.action.includes("forward") &&
            !span.action.includes("backward") &&
            !span.action.includes("XXXXXXXX") ||
            span.action.includes("network") ||
            span.action.includes("comm")
        ;

        results.push({
            rank: `${rank}-network`,
            spans: spans.filter(isNetwork)
        });
        results.push({
            rank: `${rank}-span`,
            spans: spans.filter(s => !isNetwork(s))
        });
    }

    return results;
}

const logFilePath = 'data/log-1nodes-2026-02-07-2248.log';

async function main() {
    console.log(`Parsing log file: ${logFilePath}`);
    const results = await parseLogFile(logFilePath);
    console.log(`Parsed ${results.length} ranks.`);

    const profilerData: ProfilerTrace[] = results.map(res => {
        const traceEvents: TraceEvent[] = res.spans.map(span => ({
            name: span.action,
            cat: 'log',
            ph: 'X',
            ts: span.startTime * 1000,
            dur: (span.endTime - span.startTime) * 1000,
            pid: 0,
            tid: 0,
            id: 0,
            bp: '',
            args: {
                "Total Allocated": 0,
                "Total Reserved": 0,
                "External id": 0,
                "Record function id": 0,
                "Sequence number": 0,
                "Fwd thread id": 0,
                "Ev Idx": 0
            }
        }));

        const traceFile = {
            traceEvents: traceEvents,
            fileName: `rank-${res.rank}`,
        } as unknown as TraceFile;

        return {
            trace: traceFile,
            span: traceEvents
        };
    }).sort((a, b) => a.trace.fileName.localeCompare(b.trace.fileName));

    const option = makeProfileOption(profilerData, {
        normalizeTime: true
    });

    const outputPath = 'output/pipeline_render.html';
    exportProfileChart(option, outputPath);
    console.log(`Rendered to ${outputPath}`);
}

main();
