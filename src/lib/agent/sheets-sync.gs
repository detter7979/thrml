/**
 * Google Apps Script — reference only (not compiled by Next.js).
 *
 * Extensions → Apps Script → paste, then add Script Property THRML_CRON_SECRET
 * matching your deployment CRON_SECRET. Optional: daily time-driven trigger on syncAgentData.
 */
function syncAgentData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const SECRET = PropertiesService.getScriptProperties().getProperty("THRML_CRON_SECRET")
  const BASE = "https://usethrml.com/api/admin/agent/export"

  function fetchGoal(goalType) {
    const res = UrlFetchApp.fetch(`${BASE}?goal_type=${goalType}`, {
      headers: { "x-cron-secret": SECRET },
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() !== 200) {
      console.error(`Export failed for ${goalType}:`, res.getContentText())
      return null
    }
    return JSON.parse(res.getContentText())
  }

  const guest = fetchGoal("guest")
  const host = fetchGoal("host")
  if (!guest || !host) return

  if (guest) {
    writeTab(ss, "🛒 Guest Campaigns", buildCampaignRows(guest.campaigns))
    writeTab(ss, "🛒 Guest Ad Sets", buildAdsetRows(guest.adsets))
    writeTab(ss, "🛒 Guest Decisions", buildDecisionRows(guest.decisions))
    writeTab(ss, "🛒 Guest Queue", buildQueueRows(guest.queue))
  }

  if (host) {
    writeTab(ss, "🏠 Host Campaigns", buildCampaignRows(host.campaigns))
    writeTab(ss, "🏠 Host Ad Sets", buildAdsetRows(host.adsets))
    writeTab(ss, "🏠 Host Decisions", buildDecisionRows(host.decisions))
    writeTab(ss, "🏠 Host Queue", buildQueueRows(host.queue))
  }

  const allAbTests = [...(guest.ab_tests ?? []), ...(host.ab_tests ?? [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )
  writeTab(ss, "🔬 A/B Tests", buildAbTestRows(allAbTests))

  console.log("Sync complete:", new Date().toISOString())
}

function buildCampaignRows(campaigns) {
  return [
    [
      "Platform",
      "Goal",
      "Campaign Name",
      "Type",
      "Objective",
      "Market",
      "Status",
      "Daily Budget",
      "Agent Managed",
      "Created",
    ],
    ...(campaigns ?? []).map((r) => [
      r.platform,
      r.goal_type ?? "—",
      r.campaign_name,
      r.campaign_type ?? "—",
      r.objective ?? "—",
      r.market ?? "—",
      r.status ?? "—",
      r.daily_budget != null ? `$${Number(r.daily_budget).toFixed(2)}` : "—",
      r.agent_managed ? "Yes" : "No",
      r.created_at ? new Date(r.created_at).toLocaleDateString() : "—",
    ]),
  ]
}

function buildAdsetRows(adsets) {
  return [
    [
      "Platform",
      "Goal",
      "Ad Set Name",
      "Funnel Stage",
      "Audience",
      "Market",
      "Status",
      "Daily Budget",
      "CPA Override",
      "Warn Days",
      "Reduce Days",
      "Origin",
      "Notes",
      "Warm Up Until",
    ],
    ...(adsets ?? []).map((r) => [
      r.platform,
      r.goal_type ?? "—",
      r.adset_name,
      r.funnel_stage ?? "—",
      r.aud_type ?? "—",
      r.market ?? "—",
      r.status ?? "—",
      r.daily_budget != null ? `$${Number(r.daily_budget).toFixed(2)}` : "—",
      r.target_cpa_override != null ? `$${Number(r.target_cpa_override).toFixed(2)}` : "inherit",
      r.consecutive_warn_days ?? 0,
      r.consecutive_reduce_days ?? 0,
      r.origin ?? "—",
      r.audience_notes ?? "—",
      r.warm_up_until ?? "—",
    ]),
  ]
}

function buildDecisionRows(decisions) {
  return [
    ["Date", "Platform", "Goal", "Entity", "Type", "Action", "CPA", "Target CPA", "Executed", "Rule"],
    ...(decisions ?? []).map((r) => [
      r.evaluated_at ? new Date(r.evaluated_at).toLocaleDateString() : "—",
      r.platform,
      r.goal_type ?? "—",
      r.entity_name ?? r.entity_id,
      r.entity_type,
      r.action_taken,
      r.cpa_at_decision != null ? `$${Number(r.cpa_at_decision).toFixed(2)}` : "—",
      r.target_cpa != null ? `$${Number(r.target_cpa).toFixed(2)}` : "—",
      r.action_executed ? "Yes" : "No",
      r.rule_triggered ?? "—",
    ]),
  ]
}

function buildQueueRows(queue) {
  return [
    ["Date", "Platform", "Goal", "Type", "Priority", "Reason", "Audience / Copy Suggestion", "Status"],
    ...(queue ?? []).map((r) => [
      r.created_at ? new Date(r.created_at).toLocaleDateString() : "—",
      r.platform,
      r.goal_type ?? "—",
      r.queue_type ?? "creative",
      r.priority ?? "—",
      r.reason ?? "—",
      r.audience_suggestion ?? r.copy_suggestion ?? "—",
      r.status ?? "—",
    ]),
  ]
}

function buildAbTestRows(tests) {
  return [
    ["Date", "Platform", "Goal", "Original", "Duplicate", "Audience Change", "Status", "Winner"],
    ...(tests ?? []).map((r) => [
      r.created_at ? new Date(r.created_at).toLocaleDateString() : "—",
      r.platform,
      r.goal_type ?? "—",
      r.parent_adset_id,
      r.duplicate_adset_id,
      r.audience_change ?? "—",
      r.status ?? "—",
      r.winner_id ?? "—",
    ]),
  ]
}

function writeTab(ss, tabName, rows) {
  let sheet = ss.getSheetByName(tabName)
  if (!sheet) sheet = ss.insertSheet(tabName)
  sheet.clearContents()
  if (!rows.length) return
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows)
  sheet
    .getRange(1, 1, 1, rows[0].length)
    .setBackground("#1A1410")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
  sheet.setFrozenRows(1)
  for (let i = 1; i <= rows[0].length; i++) sheet.autoResizeColumn(i)
}
