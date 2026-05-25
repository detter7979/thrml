"use client"

import { useCallback, useRef, useState } from "react"
import { FileText, Loader2, Upload, Video, X } from "lucide-react"
import { useDropzone } from "react-dropzone"

import { createClient } from "@/lib/supabase/client"
import { uploadIncidentEvidenceFile, removeIncidentEvidenceFile } from "@/lib/incidents/upload-evidence"
import { cn } from "@/lib/utils"

const MAX_FILES = 10

const ACCEPTED_TYPES = {
  "image/*": [],
  "video/*": [],
  "application/pdf": [".pdf"],
} as const

type EvidenceUploadItem = {
  id: string
  file: File
  displayName: string
  storagePath: string | null
  status: "queued" | "uploading" | "uploaded" | "error"
  progress: number
  previewUrl: string | null
  error: string | null
}

type IncidentEvidenceUploadProps = {
  userId: string
  incidentId: string | null
  ensureIncidentId: () => Promise<string>
  disabled?: boolean
  onUploadActivityChange?: (active: boolean) => void
}

function buildStorageFilename(file: File, index: number) {
  const ext = file.name.split(".").pop() || "bin"
  const safeBase = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 48)
  return `${Date.now()}-${index}-${safeBase}.${ext}`
}

function isImageFile(file: File) {
  return file.type.startsWith("image/")
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/")
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function appendEvidencePath(
  supabase: ReturnType<typeof createClient>,
  incidentId: string,
  storagePath: string
) {
  const { data: row, error: fetchError } = await supabase
    .from("incident_reports")
    .select("evidence_paths")
    .eq("id", incidentId)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  const current = Array.isArray(row?.evidence_paths)
    ? row.evidence_paths.filter((entry): entry is string => typeof entry === "string")
    : []

  const { error } = await supabase
    .from("incident_reports")
    .update({ evidence_paths: [...current, storagePath] })
    .eq("id", incidentId)

  if (error) throw new Error(error.message)
}

async function removeEvidencePath(
  supabase: ReturnType<typeof createClient>,
  incidentId: string,
  storagePath: string
) {
  const { data: row, error: fetchError } = await supabase
    .from("incident_reports")
    .select("evidence_paths")
    .eq("id", incidentId)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  const current = Array.isArray(row?.evidence_paths)
    ? row.evidence_paths.filter((entry): entry is string => typeof entry === "string")
    : []

  const { error } = await supabase
    .from("incident_reports")
    .update({ evidence_paths: current.filter((path) => path !== storagePath) })
    .eq("id", incidentId)

  if (error) throw new Error(error.message)
}

export function IncidentEvidenceUpload({
  userId,
  incidentId,
  ensureIncidentId,
  disabled = false,
  onUploadActivityChange,
}: IncidentEvidenceUploadProps) {
  const supabase = createClient()
  const [items, setItems] = useState<EvidenceUploadItem[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const uploadQueueRef = useRef(Promise.resolve())

  const hasActiveUploads = items.some((item) => item.status === "queued" || item.status === "uploading")

  const notifyUploadActivity = useCallback(
    (nextItems: EvidenceUploadItem[]) => {
      const active = nextItems.some((item) => item.status === "queued" || item.status === "uploading")
      onUploadActivityChange?.(active)
    },
    [onUploadActivityChange]
  )

  const updateItem = useCallback(
    (id: string, patch: Partial<EvidenceUploadItem>) => {
      setItems((current) => {
        const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item))
        notifyUploadActivity(next)
        return next
      })
    },
    [notifyUploadActivity]
  )

  const uploadItem = useCallback(
    async (item: EvidenceUploadItem, index: number) => {
      updateItem(item.id, { status: "uploading", progress: 0, error: null })

      try {
        const resolvedIncidentId = await ensureIncidentId()
        const filename = buildStorageFilename(item.file, index)
        const storagePath = `${userId}/${resolvedIncidentId}/${filename}`

        await uploadIncidentEvidenceFile(supabase, storagePath, item.file, (progress) => {
          if (progress.total > 0) {
            updateItem(item.id, {
              progress: Math.min(100, Math.round((progress.loaded / progress.total) * 100)),
            })
          }
        })

        await appendEvidencePath(supabase, resolvedIncidentId, storagePath)

        updateItem(item.id, {
          status: "uploaded",
          progress: 100,
          storagePath,
          error: null,
        })
      } catch (error) {
        updateItem(item.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed",
        })
        setUploadError(error instanceof Error ? error.message : "Upload failed")
      }
    },
    [ensureIncidentId, supabase, updateItem, userId]
  )

  const enqueueUploads = useCallback(
    (accepted: File[]) => {
      if (!accepted.length || disabled) return

      setUploadError(null)

      const remainingSlots = MAX_FILES - items.length
      if (remainingSlots <= 0) {
        setUploadError(`You can attach up to ${MAX_FILES} files.`)
        return
      }

      const nextFiles = accepted.slice(0, remainingSlots)
      const startIndex = items.length

      const newItems: EvidenceUploadItem[] = nextFiles.map((file, offset) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${offset}`,
        file,
        displayName: file.name,
        storagePath: null,
        status: "queued",
        progress: 0,
        previewUrl: isImageFile(file) ? URL.createObjectURL(file) : null,
        error: null,
      }))

      setItems((current) => {
        const next = [...current, ...newItems]
        notifyUploadActivity(next)
        return next
      })

      uploadQueueRef.current = uploadQueueRef.current.then(async () => {
        for (let index = 0; index < newItems.length; index += 1) {
          await uploadItem(newItems[index], startIndex + index)
        }
      })
    },
    [disabled, items.length, notifyUploadActivity, uploadItem]
  )

  const removeItem = useCallback(
    async (item: EvidenceUploadItem) => {
      if (item.status === "uploading") return

      setUploadError(null)

      try {
        if (item.storagePath) {
          const resolvedIncidentId = await ensureIncidentId()
          await removeIncidentEvidenceFile(supabase, item.storagePath)
          await removeEvidencePath(supabase, resolvedIncidentId, item.storagePath)
        }

        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)

        setItems((current) => {
          const next = current.filter((entry) => entry.id !== item.id)
          notifyUploadActivity(next)
          return next
        })
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Unable to remove file")
      }
    },
    [ensureIncidentId, notifyUploadActivity, supabase]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_TYPES,
    disabled: disabled || items.length >= MAX_FILES || hasActiveUploads,
    onDropAccepted: enqueueUploads,
    onDropRejected: () => {
      setUploadError("Please upload images, video, or PDF files only.")
    },
  })

  return (
    <section className="space-y-3">
      <div>
        <p className="text-sm font-medium text-[#1A1410]">
          Photos, video, or documents <span className="font-normal text-[#9D8D80]">(optional)</span>
        </p>
        <p className="mt-1 text-xs text-[#8C7C70]">
          Upload anything that helps document what happened — photos, video clips, medical paperwork, or other
          supporting files.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          "cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center transition",
          disabled || items.length >= MAX_FILES || hasActiveUploads
            ? "cursor-not-allowed border-[#E2D8CC] bg-[#FAF7F3] opacity-70"
            : isDragActive
              ? "border-[#C75B3A] bg-[#FFF5EE]"
              : "border-[#D7CCBE] bg-white"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto mb-2 size-5 text-[#A28E7F]" />
        <p className="text-sm text-[#5E4E42]">Drop files here or click to upload</p>
        <p className="text-xs text-[#8C7C70]">Images, video, or PDF · up to {MAX_FILES} files</p>
      </div>

      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[#E6DDD3] bg-white px-3 py-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F4ECE3]">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" className="size-full object-cover" />
                  ) : isVideoFile(item.file) ? (
                    <Video className="size-5 text-[#8C7C70]" />
                  ) : (
                    <FileText className="size-5 text-[#8C7C70]" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#2C231D]">{item.displayName}</p>
                      <p className="text-xs text-[#8C7C70]">{formatFileSize(item.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeItem(item)}
                      disabled={disabled || item.status === "uploading"}
                      className="rounded-full p-1 text-[#8C7C70] transition hover:bg-[#F4ECE3] hover:text-[#1A1410] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Remove ${item.displayName}`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {item.status === "uploading" || item.status === "queued" ? (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#EDE4DA]">
                        <div
                          className={cn(
                            "h-full rounded-full bg-[#C75B3A] transition-all duration-200",
                            item.status === "uploading" && item.progress === 0 && "animate-pulse"
                          )}
                          style={{
                            width: `${
                              item.status === "queued"
                                ? 8
                                : item.status === "uploading" && item.progress === 0
                                  ? 35
                                  : item.progress
                            }%`,
                          }}
                        />
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-[#8C7C70]">
                        {item.status === "queued" ? (
                          <>
                            <Loader2 className="size-3 animate-spin" />
                            Waiting to upload...
                          </>
                        ) : item.progress > 0 ? (
                          <>Uploading... {item.progress}%</>
                        ) : (
                          <>Uploading...</>
                        )}
                      </p>
                    </div>
                  ) : null}

                  {item.status === "uploaded" ? (
                    <p className="mt-2 text-xs text-[#2E8E57]">Uploaded</p>
                  ) : null}

                  {item.status === "error" ? (
                    <p className="mt-2 text-xs text-rose-700">{item.error ?? "Upload failed"}</p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {uploadError ? <p className="text-xs text-rose-700">{uploadError}</p> : null}
    </section>
  )
}
