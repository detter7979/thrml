import type { SupabaseClient } from "@supabase/supabase-js"

import { renderThrmlEmail } from "@/lib/emails/render-layout"
import { sendEmail } from "@/lib/emails/send"
import { runMonthlyReconciliation } from "@/lib/finance/monthly-reconciliation"

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`

/** Runs the reconciliation for `month`, logs it in agent_runs and emails Dom the summary + sheet link. */
export async function runReconciliationJob(admin: SupabaseClient, month: string, opts: { email: boolean }) {
  const t0 = Date.now()
  const { data: runRow } = await admin
    .from("agent_runs")
    .insert({ agent_name: "monthly-reconciliation", status: "running" })
    .select("id")
    .single()
  const runId = runRow?.id ?? null

  try {
    const { result, sheet, statement } = await runMonthlyReconciliation(admin, month)
    const failing = result.checks.filter((c) => !c.ok)

    if (opts.email) {
      const b = result.bottomLine
      const contentHtml = `
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:6px 0">Net platform revenue (in)</td><td style="text-align:right">${usd(b.revenue)}</td></tr>
  <tr><td style="padding:6px 0">Expenses (fixed + ad hoc + ads)</td><td style="text-align:right">${usd(-b.expenses)}</td></tr>
  <tr><td style="padding:6px 0">Stripe fees</td><td style="text-align:right">${usd(-b.stripeFees)}</td></tr>
  <tr><td style="padding:8px 0;border-top:1px solid #EDE8E2;font-weight:700">Net</td><td style="padding:8px 0;border-top:1px solid #EDE8E2;text-align:right;font-weight:700">${usd(b.net)}</td></tr>
</table>
<p style="font-size:13px;color:#796A5E;margin-top:12px">${result.marketplace.bookings} bookings · ${usd(result.marketplace.grossBookingValue)} booking value · ${result.marketplace.newUsers} new users</p>
${failing.length ? `<p style="font-size:13px;color:#C0392B;margin-top:12px"><b>Needs a look:</b><br>${failing.map((c) => `· ${c.label}: ${c.detail}`).join("<br>")}</p>` : `<p style="font-size:13px;color:#27AE60">All reconciliation checks passed.</p>`}`
      const html = await renderThrmlEmail({
        preview: `thrml reconciliation ${month}: net ${usd(b.net)}`,
        kicker: "Finance",
        title: `Monthly reconciliation — ${month}`,
        greeting: "Hi Dom,",
        contentHtml,
        cta: { label: statement ? "Open monthly statement" : "Open reconciliation sheet", href: statement?.url ?? sheet.url },
        footnote: "Generated automatically on the 1st of each month.",
      })
      await sendEmail({
        to: "etter.dom@gmail.com",
        subject: `${failing.length ? "⚠️ " : ""}thrml ${month} reconciliation · net ${usd(b.net)}`,
        html,
        text: `thrml reconciliation ${month}\nNet platform revenue: ${usd(b.revenue)}\nExpenses: ${usd(b.expenses)}\nStripe fees: ${usd(b.stripeFees)}\nNet: ${usd(b.net)}\n${sheet.url}`,
      })
    }

    if (runId) {
      await admin.from("agent_runs").update({
        status: "success",
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        results: { month, net: result.bottomLine.net, failing_checks: failing.map((c) => c.label), sheet_tab: sheet.tab },
      }).eq("id", runId)
    }
    return { ok: true as const, month, sheet, statement, bottomLine: result.bottomLine, checks: result.checks }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (runId) {
      await admin.from("agent_runs").update({
        status: "error",
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        error_message: msg,
      }).eq("id", runId)
    }
    return { ok: false as const, month, error: msg }
  }
}
