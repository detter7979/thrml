import type { MetaExecutionKindT, MetaExecutionRow, Recommendation } from "@/types/paid-media"

export type MetaExecutionKind = MetaExecutionKindT
export type MetaExecution = MetaExecutionRow
export type { Recommendation }

export type ExecutorResult = {
  success: boolean
  meta_response?: Record<string, unknown>
  http_status?: number
  error?: string
}

export type MetaAgentRunResult = {
  ok: boolean
  runId: string | null
  error?: string
  processed: number
  succeeded: number
  failed: number
  dry_run: boolean
  duration_ms: number
}
