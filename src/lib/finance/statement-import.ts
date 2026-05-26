import { existsSync, readdirSync, statSync } from "fs"
import { join } from "path"

export const DEFAULT_STATEMENTS_DIR = "data/finance-statements"

export type StatementFileInfo = {
  name: string
  path: string
  sizeBytes: number
  modifiedAt: string
  kind: "bank" | "card" | "unknown"
}

export function resolveStatementsDir() {
  return process.env.FINANCE_STATEMENTS_DIR?.trim() || DEFAULT_STATEMENTS_DIR
}

export function listStatementFiles(): { dir: string; files: StatementFileInfo[]; ready: boolean } {
  const dir = resolveStatementsDir()
  const abs = join(process.cwd(), dir)

  if (!existsSync(abs)) {
    return { dir, files: [], ready: false }
  }

  const files = readdirSync(abs)
    .filter((name) => name.toLowerCase().endsWith(".csv"))
    .map((name) => {
      const path = join(abs, name)
      const stat = statSync(path)
      const lower = name.toLowerCase()
      const kind: StatementFileInfo["kind"] = lower.includes("bank")
        ? "bank"
        : lower.includes("card") || lower.includes("amex") || lower.includes("visa")
          ? "card"
          : "unknown"
      return {
        name,
        path: join(dir, name),
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        kind,
      }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

  return { dir, files, ready: true }
}

/** Phase 2: parse CSV rows into suggested Ad Hoc cost entries. */
export function parseStatementCsvPreview(_csvText: string) {
  return {
    suggestedEntries: [] as { date: string; label: string; amount: number; category: string }[],
    note: "CSV auto-import is scaffolded. Drop files in data/finance-statements/ — parsing rules coming next.",
  }
}
