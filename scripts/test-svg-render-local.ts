#!/usr/bin/env npx tsx
import fs from "node:fs"

import {
  SPLIT_HEADER_DEFAULTS,
  prepareSplitHeaderTokens,
  renderPreparedSvg,
  renderSvgToPng,
} from "@/lib/agent/svg-template-generator"

async function main() {
  const tokens = prepareSplitHeaderTokens("1x1", {
    TAGLINE_EYEBROW: SPLIT_HEADER_DEFAULTS.TAGLINE_EYEBROW,
    HEADLINE: "Turn your idle sauna into a $1,200/mo asset.",
    SUBHEAD: SPLIT_HEADER_DEFAULTS.SUBHEAD,
  })

  const svg = renderPreparedSvg(
    fs.readFileSync("config/creative-templates/svg/thrml_split_header_static_1x1.svg", "utf8"),
    tokens,
  )
  const png = await renderSvgToPng(svg)
  fs.mkdirSync(".tmp", { recursive: true })
  fs.writeFileSync(".tmp/svg-split-local.png", png)
  console.log("[svg-local] PNG bytes:", png.length)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
