import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Loads .env.local into process.env (does not override existing vars). */
export function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local")
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}
