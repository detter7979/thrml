import type { SupabaseClient } from "@supabase/supabase-js"

const BUCKET = "incident-evidence"

type UploadProgress = {
  loaded: number
  total: number
}

type UploadOptions = {
  upsert?: boolean
  contentType?: string
  onUploadProgress?: (progress: UploadProgress) => void
}

export async function uploadIncidentEvidenceFile(
  supabase: SupabaseClient,
  path: string,
  file: File,
  onUploadProgress?: (progress: UploadProgress) => void
) {
  const options: UploadOptions = {
    upsert: false,
    contentType: file.type || undefined,
  }

  if (onUploadProgress) {
    options.onUploadProgress = onUploadProgress
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, options)

  if (error) {
    throw new Error(error.message)
  }
}

export async function removeIncidentEvidenceFile(supabase: SupabaseClient, path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) {
    throw new Error(error.message)
  }
}
