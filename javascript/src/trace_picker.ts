import { type TraceEvent, TraceFile } from './trace/TraceFile.ts'

const inpoutTrace = '/public/home/zongzan/lhr/ddlbench/out.json'
const outputTrace = '/public/home/zongzan/lhr/ddlbench/pipelinetrace.json'

const traceFile = await TraceFile.load(inpoutTrace)
const outputFile = traceFile.emptyEventFile()

const allowedTid = [0, 8, 16, 24]


function filter(event: TraceEvent): false | TraceEvent {
    const cat = event.cat
    if (cat !== 'gpu_user_annotation') {
        return false
    }

    const tid = event.tid
    if (!allowedTid.includes(tid)) {
        return false
    }


    const name = event.name
    const nameParams = new URLSearchParams(name)

    for (const [key, value] of nameParams.entries()) {
        event.args[`dcu.${key}`] = value
    }


    const func = nameParams.get('func')
    if (func == 'forward_backward_step') {
        return event;
    }

    event.name = nameParams.get('phase') || name
    return event
}


traceFile.traceEvents.forEach(event => {
    const e = filter(event)

    if (e === false) {
        return
    }

    outputFile.addTraceEvent(e)
})

 
// 输出分组结果
console.log(`Total events: ${outputFile.traceEvents.length}`);
console.log('');

await outputFile.save(outputTrace)
