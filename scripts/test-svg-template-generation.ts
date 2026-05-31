#!/usr/bin/env npx tsx
/**
 * Smoke test for SVG template static generation.
 *
 * Usage:
 *   npx tsx scripts/test-svg-template-generation.ts
 *
 * Requires GCS_BUCKET_NAME, GOOGLE_SERVICE_ACCOUNT_JSON, and Supabase service role.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import {
  generateFromSvgTemplate,
  SPLIT_HEADER_DEFAULTS,
} from "@/lib/agent/svg-template-generator"

const SAMPLE_SPLIT_TOKENS = {
  TAGLINE_EYEBROW: SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW,
  HEADLINE: SPLIT_HEADER_DEFAULTS.HEADLINE,
  SUBHEAD: SPLIT_HEADER_DEFAULTS.SUBHEAD,
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
        naming: { test_id: "T05", format: "Static_1x1", cta: "list_now", template_slug: "split_header" },
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

  console.log("[svg-test] Creating block-split brief…")
  const blockBriefId = await createTestBrief(
    "SVG block split test",
    "thrml_block_split_static",
    SAMPLE_SPLIT_TOKENS,
  )

  const blockResult = await generateFromSvgTemplate(
    blockBriefId,
    "thrml_block_split_static",
    "1:1",
    SAMPLE_SPLIT_TOKENS,
  )

  console.log("[svg-test] Block split result:", {
    assetId: blockResult.assetId,
    gcsPath: blockResult.gcsPath,
    conventionName: blockResult.conventionName,
    claimViolations: blockResult.claimViolations.length,
  })

  const expectedSuffix = "hosts/pov_earnings/Static/block_split/A_1x1.png"
  if (!blockResult.gcsPath.endsWith(expectedSuffix)) {
    throw new Error(`Unexpected block split GCS path: ${blockResult.gcsPath}`)
  }

  const splitSuffix = "hosts/pov_earnings/Static/split_header/A_1x1.png"
  if (!splitResult.gcsPath.endsWith(splitSuffix)) {
    throw new Error(`Unexpected split header GCS path: ${splitResult.gcsPath}`)
  }

  console.log("[svg-test] OK — split header and block split uploaded with convention names.")
}

main().catch((err) => {
  console.error("[svg-test] FAILED", err)
  process.exit(1)
})
