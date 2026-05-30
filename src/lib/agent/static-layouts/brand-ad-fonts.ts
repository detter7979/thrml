import path from "node:path"
import { readFile } from "node:fs/promises"

const SERIF_REGULAR = path.join(process.cwd(), "public", "fonts", "DMSerifDisplay-Regular.ttf")
const SERIF_ITALIC = path.join(process.cwd(), "public", "fonts", "DMSerifDisplay-Italic.ttf")
const SANS_MEDIUM = path.resolve(
  process.cwd(),
  "node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2",
)

let serifDataUrlsPromise: Promise<{ regular: string; italic: string }> | null = null
let sansMediumDataUrlPromise: Promise<string> | null = null

export async function loadBrandSerifFontDataUrls() {
  if (!serifDataUrlsPromise) {
    serifDataUrlsPromise = Promise.all([readFile(SERIF_REGULAR), readFile(SERIF_ITALIC)]).then(
      ([regular, italic]) => ({
        regular: `data:font/ttf;base64,${regular.toString("base64")}`,
        italic: `data:font/ttf;base64,${italic.toString("base64")}`,
      }),
    )
  }
  return serifDataUrlsPromise
}

export async function loadBrandSansMediumDataUrl() {
  if (!sansMediumDataUrlPromise) {
    sansMediumDataUrlPromise = readFile(SANS_MEDIUM).then(
      (sansMedium) => `data:font/woff2;base64,${sansMedium.toString("base64")}`,
    )
  }
  return sansMediumDataUrlPromise
}

export function buildBrandAdFontStyleBlock(serif: { regular: string; italic: string }, sansMedium: string) {
  return `<style>
    @font-face {
      font-family: "DM Serif Display";
      src: url("${serif.regular}") format("truetype");
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: "DM Serif Display";
      src: url("${serif.italic}") format("truetype");
      font-weight: 400;
      font-style: italic;
    }
    @font-face {
      font-family: "thrml-sans";
      src: url("${sansMedium}") format("woff2");
      font-weight: 500;
      font-style: normal;
    }
    :root {
      --brand-serif: "DM Serif Display", Georgia, "Times New Roman", serif;
      --brand-sans: "thrml-sans", "Helvetica Neue", Arial, sans-serif;
    }
  </style>`
}

export async function injectBrandAdFonts(svg: string) {
  const [serif, sansMedium] = await Promise.all([loadBrandSerifFontDataUrls(), loadBrandSansMediumDataUrl()])
  const styleBlock = buildBrandAdFontStyleBlock(serif, sansMedium)

  if (svg.includes("<style>")) {
    return svg.replace(/<style>[\s\S]*?<\/style>/, styleBlock)
  }
  return svg.replace(/<svg([^>]*)>/, `<svg$1>${styleBlock}`)
}
