import { baseVideoPath, resolveCreativeBucketName } from "@/lib/agent/gcs-paths"

export { resolveCreativeBucketName }

/** Matches T4 `config/creative-templates.yaml` video block. */
export const T4_BASE_VIDEO_UPLOAD = {
  conceptSlug: "pov-earnings",
  assetSlug: "sauna",
  category: "Hosts",
  angleSlug: "pov_earnings",
  version: 1,
} as const

export function normalizeGcsObjectPath(path: string) {
  return path.trim().replace(/^gs:\/\/[^/]+\//, "")
}

export function suggestedT4BaseVideoObjectPath(date = new Date()) {
  return baseVideoPath({
    date,
    conceptSlug: T4_BASE_VIDEO_UPLOAD.conceptSlug,
    assetSlug: T4_BASE_VIDEO_UPLOAD.assetSlug,
    source: "uploaded",
    version: T4_BASE_VIDEO_UPLOAD.version,
    category: T4_BASE_VIDEO_UPLOAD.category,
    angleSlug: T4_BASE_VIDEO_UPLOAD.angleSlug,
  })
}

export function suggestedT4BaseVideoGsUri(creativeBucket = resolveCreativeBucketName(), date = new Date()) {
  return `gs://${creativeBucket}/${suggestedT4BaseVideoObjectPath(date)}`
}

export function gsutilUploadCommand(
  localFile = "your-sauna.mp4",
  creativeBucket = resolveCreativeBucketName(),
  date = new Date(),
) {
  return `gsutil cp ${localFile} ${suggestedT4BaseVideoGsUri(creativeBucket, date)}`
}

/** Matches T5 block-split video template in `config/creative-templates.yaml`. */
export const T5_BLOCK_SPLIT_VIDEO_UPLOAD = {
  conceptSlug: "pov-earnings",
  assetSlug: "block-split",
  category: "Hosts",
  angleSlug: "pov_earnings",
  version: 1,
} as const

export function suggestedT5BlockSplitVideoObjectPath(date = new Date()) {
  return baseVideoPath({
    date,
    conceptSlug: T5_BLOCK_SPLIT_VIDEO_UPLOAD.conceptSlug,
    assetSlug: T5_BLOCK_SPLIT_VIDEO_UPLOAD.assetSlug,
    source: "uploaded",
    version: T5_BLOCK_SPLIT_VIDEO_UPLOAD.version,
    category: T5_BLOCK_SPLIT_VIDEO_UPLOAD.category,
    angleSlug: T5_BLOCK_SPLIT_VIDEO_UPLOAD.angleSlug,
  })
}

export function suggestedT5BlockSplitVideoGsUri(
  creativeBucket = resolveCreativeBucketName(),
  date = new Date(),
) {
  return `gs://${creativeBucket}/${suggestedT5BlockSplitVideoObjectPath(date)}`
}

export function gsutilBlockSplitUploadCommand(
  localFile = "your-block-split.mp4",
  creativeBucket = resolveCreativeBucketName(),
  date = new Date(),
) {
  return `gsutil cp ${localFile} ${suggestedT5BlockSplitVideoGsUri(creativeBucket, date)}`
}
