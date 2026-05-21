/**
 * Preview the unified Thrml email layout (orange-forward mock).
 *
 *   npx tsx scripts/preview-email-mock.ts
 *     → writes thrml-email-mock.html (all 3 samples)
 *
 *   npx tsx scripts/preview-email-mock.ts --variant guest-confirm
 *     → single variant HTML file
 *
 *   npx tsx scripts/preview-email-mock.ts --send --variant guest-confirm
 *     → sends one sample via Resend (RESEND_API_KEY + RESEND_TEST_TO_EMAIL)
 *
 * Variants: guest-confirm | host-booking | access-code
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { render } from "@react-email/render"
import { Resend } from "resend"

import { MockEmail, MOCK_VARIANTS, type MockVariant } from "../emails/mocks/transactional-samples"

const THRML_FROM = "Thrml <notifications@usethrml.com>"
const OUT_FILE = resolve(process.cwd(), "thrml-email-mock.html")

function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local")
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "")
      }
    }
  } catch {
    // optional
  }
}

function parseVariant(): MockVariant | "all" {
  const idx = process.argv.indexOf("--variant")
  if (idx === -1 || !process.argv[idx + 1]) return "all"
  const v = process.argv[idx + 1] as MockVariant
  if (!MOCK_VARIANTS.includes(v)) {
    console.error(`Unknown variant "${v}". Use: ${MOCK_VARIANTS.join(" | ")}`)
    process.exit(1)
  }
  return v
}

function variantLabel(v: MockVariant) {
  switch (v) {
    case "guest-confirm":
      return "Guest — booking confirmed"
    case "host-booking":
      return "Host — new booking"
    case "access-code":
      return "Guest — access details"
  }
}

async function renderVariant(variant: MockVariant) {
  return render(MockEmail({ variant }))
}

function wrapPreviewPage(sections: { label: string; html: string }[]) {
  const bodies = sections
    .map(
      (s, i) => `
    <section style="margin:0 auto 48px;max-width:640px;">
      <h2 style="font-family:system-ui,sans-serif;font-size:14px;font-weight:600;color:#7A6355;
        text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px;padding:0 8px;">
        ${i + 1}. ${s.label}
      </h2>
      <div style="border:1px dashed #EDE8E2;border-radius:12px;overflow:hidden;">
        ${s.html}
      </div>
    </section>`
    )
    .join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Thrml email mock — unified layout</title>
  <style>
    body { margin:0; padding:32px 16px 64px; background:#EDE8E2; }
    .page-title { font-family:system-ui,sans-serif; text-align:center; margin:0 0 8px; color:#1A1410; }
    .page-sub { font-family:system-ui,sans-serif; text-align:center; margin:0 0 32px; color:#7A6355; font-size:14px; }
  </style>
</head>
<body>
  <h1 class="page-title">Thrml email mock</h1>
  <p class="page-sub">Orange-forward unified layout · not sent to users yet</p>
  ${bodies}
</body>
</html>`
}

async function main() {
  loadEnvLocal()
  const variant = parseVariant()
  const send = process.argv.includes("--send")
  const stdoutOnly = process.argv.includes("--stdout")

  if (send) {
    const v = variant === "all" ? "guest-confirm" : variant
    const apiKey = process.env.RESEND_API_KEY?.trim()
    const to = process.env.RESEND_TEST_TO_EMAIL?.trim()
    if (!apiKey || !to) {
      console.error("Set RESEND_API_KEY and RESEND_TEST_TO_EMAIL in .env.local for --send")
      process.exit(1)
    }
    const html = await renderVariant(v)
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL?.trim() || THRML_FROM,
      to: [to],
      subject: `[Mock] Thrml email — ${variantLabel(v)}`,
      html,
      text: `Preview mock: ${variantLabel(v)}. Open HTML version for full layout.`,
    })
    if (error) {
      console.error("Resend error:", error)
      process.exit(1)
    }
    console.log(`Sent mock "${v}" to ${to} (id: ${data?.id ?? "?"})`)
    return
  }

  if (variant === "all") {
    const sections: { label: string; html: string }[] = []
    for (const v of MOCK_VARIANTS) {
      sections.push({ label: variantLabel(v), html: await renderVariant(v) })
    }
    writeFileSync(OUT_FILE, wrapPreviewPage(sections), "utf8")
    console.log(`Wrote ${OUT_FILE}`)
    console.log("Open in a browser, or send one variant:")
    console.log("  npx tsx scripts/preview-email-mock.ts --send --variant guest-confirm")
    return
  }

  const html = await renderVariant(variant)
  if (stdoutOnly) {
    process.stdout.write(html)
    return
  }
  writeFileSync(OUT_FILE, html, "utf8")
  console.log(`Wrote ${OUT_FILE} (${variant})`)
}

void main()
