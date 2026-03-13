import { TraceFile } from './trace/TraceFile.ts';

const filePath = "output/out.json"
const outputPath = "output/pipeline.json"

async function main() {
    const runTrace = await TraceFile.load(filePath, { idCheck: false });
    const newTrace = runTrace.emptyEventFile()

    runTrace.traceEvents.forEach(event => {
        const tName = event.name
        if (tName.startsWith("XXXXXXXX:")) {
            const name = tName.substring(9).trim()
            const nameParams = new URLSearchParams(name)

            const func = nameParams.get("func")

            for (const [key, value] of nameParams.entries()) {
                event.args[`dcu.${key}`] = value
            }

            event.name = name

            if (func == "forward_backward_step") {
                newTrace.addTraceEvent(event)
            }
        } else if (tName.startsWith("nccl:recv ") || tName.startsWith("nccl:send ")) {
            newTrace.addTraceEvent(event)
        }
    })

    await newTrace.save(outputPath)
}

main();
