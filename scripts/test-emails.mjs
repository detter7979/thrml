#!/usr/bin/env node
/**
 * thrml email test runner
 * Usage: node scripts/test-emails.mjs [test-name]
 *
 * Runs against production (usethrml.com) using CRON_SECRET from .env.local.
 * All results appear in Resend → Logs within seconds.
 *
 * Tests:  reminders | retarget | review | messages | all
 */

import { readFileSync } from "fs"
import { resolve } from "path"

const envPath = resolve(process.cwd(), ".env.local")
const env = {}
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "")
}

const BASE = "https://usethrml.com"
const SECRET = env.CRON_SECRET
if (!SECRET) { console.error("❌  CRON_SECRET not in .env.local"); process.exit(1) }

const hdrs = {
  "Content-Type": "application/json",
  "x-cron-secret": SECRET,
  Authorization: `Bearer ${SECRET}`,
}

async function hit(label, path) {
  process.stdout.write(`  → ${label}... `)
  try {
    const r = await fetch(`${BASE}${path}`, { headers: hdrs })
    const j = await r.json().catch(() => ({}))
    console.log(`${r.ok ? "✅" : "❌"} ${r.status}`, JSON.stringify(j).slice(0, 140))
  } catch (e) { console.log(`❌  ${e.message}`) }
}

const arg = process.argv[2] ?? "all"
const t = Date.now()

console.log(`\n🧪  thrml email tests  [${BASE}]`)
console.log(`    Resend logs → https://resend.com/emails\n`)

if (arg === "reminders" || arg === "all") {
  console.log("📬  24h reminders, access codes, post-session, host confirmations")
  await hit("cron/reminders", "/api/cron/reminders")
}

if (arg === "retarget" || arg === "all") {
  console.log("\n🎯  Host/guest retargeting + weekly newsletter digest")
  await hit("cron/retarget", "/api/cron/retarget")
}

if (arg === "review" || arg === "all") {
  console.log("\n⭐  Post-session review request emails")
  await hit("cron/review-requests", "/api/cron/review-requests")
}

if (arg === "messages" || arg === "all") {
  console.log("\n💬  Automated host → guest in-app messages")
  await hit("cron/send-messages", "/api/cron/send-messages")
}

if (arg === "signup" || arg === "all") {
  console.log("\n👋  Guest/host welcome emails")
  console.log("  ℹ️  These fire from the browser on signup — see manual steps below:")
  console.log("  Guest:  sign up at usethrml.com/signup with a new email")
  console.log("  Host:   start the become-a-host flow at usethrml.com/become-a-host")
  console.log("  Then check Resend → Logs for the welcome email within ~5s")
}

console.log(`\n✅  Done in ${((Date.now() - t) / 1000).toFixed(1)}s  —  https://resend.com/emails\n`)
