import {type TraceEvent, TraceFile} from './trace/TraceFile.ts'

const trace = 'C:\\Users\\mo\\work\\pacman-workspace\\javascript\\data\\ep\\ep8\\torch_prof_aibenchmark_tp2_pp1_ep8_etp1_vp\\trace_rank0_step11.json'
const traceFile = new TraceFile(trace);

function getStack(event: TraceEvent): any {
    const externalId = event.args["External id"]

    const markers = traceFile.filterEvent(s => !!s.args && s.args["External id"] == externalId && s.cat == "user_annotation");
    if (markers.length != 1) {
        throw new Error(`Expected exactly one user_annotation event with External id ${externalId}, but found ${s.length}`);
    }

    const marker = markers[0]!;

    if (!marker.ts) {
        throw new Error(`Marker event does not have a timestamp`);
    }

    return traceFile.getParent(marker)
}

// 将栈序列转换为字符串作为分组键
function stackToKey(stack: any[]): string {
    return stack.map(s => s.name).join('\n');
}

const result = traceFile.filterEvent(
    (item) => {
        return item.name == "nccl:all_to_all" && item.cat == 'gpu_user_annotation'
    }
);

// 按栈分组
const groupedByStack = new Map<string, TraceEvent[]>();

result.forEach((event) => {
    try {
        const stack = getStack(event);
        const key = stackToKey(stack);

        if (!groupedByStack.has(key)) {
            groupedByStack.set(key, []);
        }
        groupedByStack.get(key)!.push(event);
    } catch (error) {
        console.error(`Error processing event:`, error);
    }
});

// 输出分组结果
console.log(`Total events: ${result.length}`);
console.log(`Total unique stacks: ${groupedByStack.size}`);
console.log('');

let categoryIndex = 0;
for (const [stackKey, events] of groupedByStack.entries()) {
    console.log(`[类型编号${categoryIndex}] ${stackKey}`);
    console.log(`Count: ${events.length} events`);
    console.log('Events:', events.map(e => ({
        name: e.name,
        ts: e.ts,
        dur: e.dur,
        tid: e.tid
    })));
    console.log('');
    categoryIndex++;
}

