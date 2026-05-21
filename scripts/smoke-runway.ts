/**
 * Manual smoke test for Runway API wrapper.
 * Usage: RUNWAY_API_KEY=... npx tsx scripts/smoke-runway.ts
 */
import { generateVideo, pollTask } from "../src/lib/agent/runway"

async function main() {
  if (!process.env.RUNWAY_API_KEY) {
    console.error("Set RUNWAY_API_KEY to run this script.")
    process.exit(1)
  }

  const prompt = process.argv[2] ?? "A wooden sauna in Pacific Northwest forest, warm light, cinematic"
  console.log("Starting Runway generation:", prompt)

  const { taskId } = await generateVideo({ prompt, duration: 5, ratio: "768:1280" })
  console.log("Task ID:", taskId)

  const task = await pollTask(taskId, { intervalMs: 5_000 })
  console.log("Final status:", task.status)
  if (task.output?.length) {
    console.log("Output URL:", task.output[0])
  }
  if (task.failure) {
    console.error("Failure:", task.failure, task.failureCode)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
