#!/usr/bin/env npx tsx
/**
 * Smoke test for SVG template static generation.
 *
 * Usage:
 *   npx tsx scripts/test-svg-template-generation.ts
 *
 * Requires GCS_BUCKET_NAME, GOOGLE_SERVICE_ACCOUNT_JSON, and Supabase service role.
 * Optional: TEST_POV_PHOTO_GCS_PATH for POV overlay background (object path, not gs:// URL).
 */

import { createAdminClient } from "@/lib/supabase/admin"
import {
  generateFromSvgTemplate,
  SPLIT_HEADER_DEFAULTS,
} from "@/lib/agent/svg-template-generator"

const SAMPLE_SPLIT_TOKENS = {
  TAGLINE_EYEBROW: SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW,
  HEADLINE: "Turn your idle sauna into a $1,200/mo asset.",
  SUBHEAD: SPLIT_HEADER_DEFAULTS.SUBHEAD,
}

const SAMPLE_POV_TOKENS = {
  POV_LINE_1: "pov: your sauna earns you $1,200/mo",
  POV_LINE_2: "List on thrml. Get paid when you're not using it.",
}

async function createTestBrief(label: string, svgTemplateId: string, tokens: Record<string, string>) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("creative_briefs")
    .insert({
      trigger_type: "manual",
      status: "briefed",
      format: "1x1",
      hook: label,
      campaign_short_name: "pov-earnings",
      trigger_data: {
        category: "Hosts",
        angle: "pov_earnings",
        generation_tool: "svg_template",
        svg_template_id: svgTemplateId,
        svg_tokens: tokens,
        naming: { test_id: "T05", format: "Static_1x1", cta: "list_now" },
        variations: 1,
        concept_verify: true,
      },
      success_criteria: { variations: 1, formats: ["1x1"], concept_verify: true },
      created_by: "test-script",
    })
    .select("id")
    .maybeSingle()

  if (error) throw error
  if (!data?.id) throw new Error("Failed to create test brief")
  return data.id
}

async function main() {
  console.log("[svg-test] Creating split-header brief…")
  const splitBriefId = await createTestBrief(
    "SVG split header test",
    "thrml_split_header_static",
    SAMPLE_SPLIT_TOKENS,
  )

  const splitResult = await generateFromSvgTemplate(
    splitBriefId,
    "thrml_split_header_static",
    "1:1",
    SAMPLE_SPLIT_TOKENS,
  )

  console.log("[svg-test] Split header result:", {
    assetId: splitResult.assetId,
    gcsPath: splitResult.gcsPath,
    conventionName: splitResult.conventionName,
    claimViolations: splitResult.claimViolations.length,
  })

  const povPhotoPath = process.env.TEST_POV_PHOTO_GCS_PATH?.trim() || null

  console.log("[svg-test] Creating POV overlay brief…")
  const povBriefId = await createTestBrief("SVG POV overlay test", "thrml_pov_overlay_static", SAMPLE_POV_TOKENS)

  const povResult = await generateFromSvgTemplate(
    povBriefId,
    "thrml_pov_overlay_static",
    "1:1",
    SAMPLE_POV_TOKENS,
    povPhotoPath,
  )

  console.log("[svg-test] POV overlay result:", {
    assetId: povResult.assetId,
    gcsPath: povResult.gcsPath,
    conventionName: povResult.conventionName,
    claimViolations: povResult.claimViolations.length,
  })

  const expectedPrefix = `${new Date().getUTCFullYear()}/${String(new Date().getUTCMonth() + 1).padStart(2, "0")}/hosts/pov_earnings/Static/A_1x1.png`
  for (const result of [splitResult, povResult]) {
    if (!result.gcsPath.endsWith("hosts/pov_earnings/Static/A_1x1.png")) {
      throw new Error(`Unexpected GCS path: ${result.gcsPath} (expected suffix ${expectedPrefix})`)
    }
    if (!result.conventionName?.startsWith("T05_A_pov_earnings_Static_1x1_list_now")) {
      throw new Error(`Unexpected convention name: ${result.conventionName}`)
    }
  }

  console.log("[svg-test] OK — both assets uploaded with thrml_namer_v4 convention names.")
}

main().catch((err) => {
  console.error("[svg-test] FAILED", err)
  process.exit(1)
})
