import { Storage } from "@google-cloud/storage"

const SIGNED_URL_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000
const ARCHIVE_PREFIX = "_archive/"
const GENERATED_BY = "thrml-agent"

export type CreativeAssetKind = "reference" | "static" | "video"

export type UploadCreativeAssetOptions = {
  campaignShortName: string
  briefId: string
  kind: CreativeAssetKind
  filename: string
  contentType: string
  /** When set, writes to this exact object path instead of legacy month/campaign/brief layout. */
  unifiedObjectPath?: string
}

export type UploadedCreativeAsset = {
  gcsPath: string
  gcsUrl: string
  publicUrl: string
}

export type ListedCreativeAsset = UploadedCreativeAsset & {
  name: string
  filename: string
  kind: CreativeAssetKind | null
  contentType: string | null
  createdAt: string | null
  updatedAt: string | null
  size: string | number | null
  metadata: Record<string, string>
}

export type ArchivedCreativeAsset = {
  from: string
  to: string
}

export type DownloadedCreativeAsset = {
  buffer: Buffer
  contentType: string
  filename: string
  signedUrl: string
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function monthPath(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

function pathPrefix() {
  return (process.env.GCS_PATH_PREFIX ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/")
}

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured")

  const parseJson = (value: string) => {
    const parsed = JSON.parse(value)
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed
  }

  try {
    return parseJson(raw)
  } catch (jsonErr) {
    try {
      return parseJson(Buffer.from(raw, "base64").toString("utf8").trim())
    } catch (base64Err) {
      const jsonMessage = jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
      const base64Message = base64Err instanceof Error ? base64Err.message : String(base64Err)
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_JSON must be valid service account JSON or base64-encoded JSON. JSON parse failed: ${jsonMessage}; base64 parse failed: ${base64Message}`
      )
    }
  }
}

function createStorageClient() {
  const credentials = loadCredentials()
  return new Storage({ credentials })
}

function creativeBucketName() {
  return process.env.GCS_CREATIVE_BUCKET?.trim() || requireEnv("GCS_BUCKET_NAME")
}

function getBucket() {
  return createStorageClient().bucket(requireEnv("GCS_BUCKET_NAME"))
}

function getCreativeBucket() {
  return createStorageClient().bucket(creativeBucketName())
}

function pathSegment(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed.replaceAll("/", "-")
}

function kindFolder(kind: CreativeAssetKind) {
  return `${kind}s`
}

function publicUrl(bucketName: string, objectPath: string) {
  return `https://storage.googleapis.com/${bucketName}/${encodeURI(objectPath)}`
}

function parseGcsPath(gcsPath: string) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsPath) ?? /^([^/]+)\/(.+)$/.exec(gcsPath)
  if (!match) throw new Error(`Invalid GCS path: ${gcsPath}`)
  return { bucketName: match[1], objectPath: match[2] }
}

function fileForStoredGcsPath(bucketName: string, objectPath: string) {
  const mainBucket = requireEnv("GCS_BUCKET_NAME")
  const creativeBucket = process.env.GCS_CREATIVE_BUCKET?.trim() || mainBucket

  // Legacy rows store gs://thrml-creative/... when no separate creative bucket exists.
  if (bucketName === "thrml-creative" && !process.env.GCS_CREATIVE_BUCKET?.trim()) {
    return getBucket().file(objectPath)
  }
  if (bucketName === mainBucket) return getBucket().file(objectPath)
  if (bucketName === creativeBucket) return getCreativeBucket().file(objectPath)

  throw new Error(
    `GCS path bucket ${bucketName} does not match configured buckets (${mainBucket}${creativeBucket !== mainBucket ? `, ${creativeBucket}` : ""})`
  )
}

export function normalizeCreativeAssetGcsPath(gcsPath: string) {
  const { bucketName, objectPath } = parseGcsPath(gcsPath)
  const mainBucket = requireEnv("GCS_BUCKET_NAME")
  const creativeBucket = process.env.GCS_CREATIVE_BUCKET?.trim() || mainBucket

  let effectiveBucket = bucketName
  if (bucketName === "thrml-creative" && !process.env.GCS_CREATIVE_BUCKET?.trim()) {
    effectiveBucket = mainBucket
  } else if (bucketName !== mainBucket && bucketName !== creativeBucket) {
    throw new Error(
      `GCS path bucket ${bucketName} does not match configured buckets (${mainBucket}${creativeBucket !== mainBucket ? `, ${creativeBucket}` : ""})`
    )
  }
  return `gs://${effectiveBucket}/${objectPath}`
}

async function signedReadUrl(file: ReturnType<ReturnType<typeof getBucket>["file"]>) {
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + SIGNED_URL_EXPIRES_MS,
  })
  return url
}

export async function getSignedGcsReadUrl(gcsPath: string, opts?: { expiresInSec?: number }) {
  const { bucketName, objectPath } = parseGcsPath(gcsPath)
  const expiresInSec = opts?.expiresInSec ?? 3600
  const creativeBucketName = process.env.GCS_CREATIVE_BUCKET?.trim()
  const mainBucketName = requireEnv("GCS_BUCKET_NAME")

  let file
  if (creativeBucketName && bucketName === creativeBucketName) {
    file = getCreativeBucket().file(objectPath)
  } else if (bucketName === mainBucketName) {
    file = getBucket().file(objectPath)
  } else {
    throw new Error(
      `GCS path bucket ${bucketName} does not match configured buckets (${mainBucketName}${creativeBucketName ? `, ${creativeBucketName}` : ""})`
    )
  }

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresInSec * 1000,
  })
  return url
}

export async function refreshCreativeAssetUrl(gcsPath: string) {
  const { bucketName, objectPath } = parseGcsPath(gcsPath)
  return signedReadUrl(fileForStoredGcsPath(bucketName, objectPath))
}

export async function downloadCreativeAsset(gcsPath: string): Promise<DownloadedCreativeAsset> {
  const normalized = normalizeCreativeAssetGcsPath(gcsPath)
  const { bucketName, objectPath } = parseGcsPath(normalized)
  const file = fileForStoredGcsPath(bucketName, objectPath)
  const signedUrl = await signedReadUrl(file)
  const res = await fetch(signedUrl)
  if (!res.ok) throw new Error(`GCS download failed: ${res.status} ${await res.text()}`)

  const arrayBuffer = await res.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    filename: objectPath.split("/").at(-1) ?? "creative-asset",
    signedUrl,
  }
}

function assetKindFromPath(objectPath: string): CreativeAssetKind | null {
  const folder = objectPath.split("/").at(-2)
  if (folder === "references") return "reference"
  if (folder === "statics") return "static"
  if (folder === "videos") return "video"
  return null
}

function assetCreatedAt(fileMetadata: Record<string, unknown>) {
  const customMetadata = fileMetadata.metadata as Record<string, string> | undefined
  return customMetadata?.created_at ?? (typeof fileMetadata.timeCreated === "string" ? fileMetadata.timeCreated : null)
}

function isBriefAsset(objectPath: string, briefId: string) {
  const parts = objectPath.split("/")
  const monthIndex = parts.findIndex((part) => /^\d{4}-\d{2}$/.test(part))
  return monthIndex >= 0 && parts[monthIndex + 2] === briefId && parts.length >= monthIndex + 5
}

export async function uploadCreativeAsset(
  buffer: Buffer,
  opts: UploadCreativeAssetOptions
): Promise<UploadedCreativeAsset> {
  const bucket = getBucket()
  const bucketName = bucket.name
  const prefix = pathPrefix()
  const objectPath = opts.unifiedObjectPath
    ? opts.unifiedObjectPath
    : (() => {
        const objectParts = [
          monthPath(),
          pathSegment(opts.campaignShortName, "campaignShortName"),
          pathSegment(opts.briefId, "briefId"),
          kindFolder(opts.kind),
          pathSegment(opts.filename, "filename"),
        ]
        return prefix ? [prefix, ...objectParts].join("/") : objectParts.join("/")
      })()
  const file = bucket.file(objectPath)
  const createdAt = new Date().toISOString()

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: opts.contentType,
      metadata: {
        brief_id: opts.briefId,
        generated_by: GENERATED_BY,
        created_at: createdAt,
      },
    },
  })

  return {
    gcsPath: `gs://${bucketName}/${objectPath}`,
    gcsUrl: await signedReadUrl(file),
    publicUrl: publicUrl(bucketName, objectPath),
  }
}

export async function listAssetsForBrief(briefId: string): Promise<ListedCreativeAsset[]> {
  const cleanBriefId = pathSegment(briefId, "briefId")
  const bucket = getBucket()
  const [files] = await bucket.getFiles()
  const assets = files.filter((file) => !file.name.startsWith(ARCHIVE_PREFIX) && isBriefAsset(file.name, cleanBriefId))

  return Promise.all(
    assets.map(async (file) => {
      const metadata = file.metadata as Record<string, unknown>
      const customMetadata = (metadata.metadata ?? {}) as Record<string, string>

      return {
        name: file.name,
        filename: file.name.split("/").at(-1) ?? file.name,
        kind: assetKindFromPath(file.name),
        contentType: typeof metadata.contentType === "string" ? metadata.contentType : null,
        createdAt: assetCreatedAt(metadata),
        updatedAt: typeof metadata.updated === "string" ? metadata.updated : null,
        size: (metadata.size as string | number | undefined) ?? null,
        metadata: customMetadata,
        gcsPath: `gs://${bucket.name}/${file.name}`,
        gcsUrl: await signedReadUrl(file),
        publicUrl: publicUrl(bucket.name, file.name),
      }
    })
  )
}

export async function uploadBufferToCreativeObject(
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<UploadedCreativeAsset> {
  const bucket = getCreativeBucket()
  const bucketName = bucket.name
  const file = bucket.file(objectPath)

  await file.save(buffer, {
    resumable: false,
    metadata: { contentType },
  })

  return {
    gcsPath: `gs://${bucketName}/${objectPath}`,
    gcsUrl: await signedReadUrl(file),
    publicUrl: publicUrl(bucketName, objectPath),
  }
}

export async function uploadRemoteToCreativeObject(
  sourceUrl: string,
  objectPath: string
): Promise<UploadedCreativeAsset> {
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    throw new Error(`Failed to download source video: ${res.status} ${await res.text()}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get("content-type") ?? "video/mp4"
  return uploadBufferToCreativeObject(objectPath, buffer, contentType)
}

export async function getCreativeSignedWriteUrl(objectPath: string, contentType: string) {
  const file = getCreativeBucket().file(objectPath)
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  })
  return url
}

export async function refreshCreativeObjectUrl(gcsPathOrObject: string) {
  const objectPath = gcsPathOrObject.startsWith("gs://")
    ? parseGcsPath(gcsPathOrObject).objectPath
    : gcsPathOrObject
  return signedReadUrl(getCreativeBucket().file(objectPath))
}

export type AssetLibraryEntry = ListedCreativeAsset & {
  bucket: "main" | "creative"
  mediaType: "static" | "video" | "unknown"
}

function mediaTypeFromPath(objectPath: string): AssetLibraryEntry["mediaType"] {
  const lower = objectPath.toLowerCase()
  if (lower.includes("/static/") || /\.(png|jpg|jpeg|webp)$/.test(lower)) return "static"
  if (lower.includes("/video/") || lower.startsWith("bases/") || lower.startsWith("renders/") || /\.(mp4|mov|webm)$/.test(lower)) {
    return "video"
  }
  return "unknown"
}

/** List creative assets from main + creative buckets for admin asset library. */
export async function listCreativeAssetLibrary(opts?: {
  prefix?: string
  mediaType?: "static" | "video" | "all"
  limit?: number
}): Promise<AssetLibraryEntry[]> {
  const limit = opts?.limit ?? 200
  const prefix = opts?.prefix?.trim() ?? ""
  const mediaFilter = opts?.mediaType ?? "all"
  const entries: AssetLibraryEntry[] = []

  async function collect(bucketKind: "main" | "creative", bucket: ReturnType<typeof getBucket>) {
    const [files] = await bucket.getFiles({ prefix: prefix || undefined, maxResults: limit })
    for (const file of files) {
      if (file.name.startsWith(ARCHIVE_PREFIX) || file.name.endsWith("/")) continue
      const metadata = file.metadata as Record<string, unknown>
      const customMetadata = (metadata.metadata ?? {}) as Record<string, string>
      const mediaType = mediaTypeFromPath(file.name)
      if (mediaFilter !== "all" && mediaType !== mediaFilter) continue

      entries.push({
        name: file.name,
        filename: file.name.split("/").at(-1) ?? file.name,
        kind: assetKindFromPath(file.name),
        contentType: typeof metadata.contentType === "string" ? metadata.contentType : null,
        createdAt: assetCreatedAt(metadata),
        updatedAt: typeof metadata.updated === "string" ? metadata.updated : null,
        size: (metadata.size as string | number | undefined) ?? null,
        metadata: customMetadata,
        gcsPath: `gs://${bucket.name}/${file.name}`,
        gcsUrl: await signedReadUrl(file),
        publicUrl: publicUrl(bucket.name, file.name),
        bucket: bucketKind,
        mediaType,
      })
    }
  }

  await collect("main", getBucket())
  if (entries.length < limit) {
    await collect("creative", getCreativeBucket())
  }

  return entries
    .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))
    .slice(0, limit)
}

export async function deleteCreativeObject(gcsPathOrObject: string): Promise<boolean> {
  const objectPath = gcsPathOrObject.startsWith("gs://")
    ? parseGcsPath(gcsPathOrObject).objectPath
    : gcsPathOrObject.replace(/^\/+/, "")

  try {
    let file
    if (gcsPathOrObject.startsWith("gs://")) {
      const { bucketName } = parseGcsPath(gcsPathOrObject)
      file = fileForStoredGcsPath(bucketName, objectPath)
    } else {
      const mainFile = getBucket().file(objectPath)
      const [mainExists] = await mainFile.exists()
      file = mainExists ? mainFile : getCreativeBucket().file(objectPath)
    }

    await file.delete({ ignoreNotFound: true })
    return true
  } catch (err) {
    console.warn("[gcs] deleteCreativeObject failed", objectPath, err)
    return false
  }
}

export async function archiveOldAssets(daysOld = 90): Promise<{ archived: number; assets: ArchivedCreativeAsset[] }> {
  const bucket = getBucket()
  const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000
  const [files] = await bucket.getFiles()
  const archived: ArchivedCreativeAsset[] = []

  for (const file of files) {
    if (file.name.startsWith(ARCHIVE_PREFIX)) continue

    const metadata = file.metadata as Record<string, unknown>
    const createdAt = assetCreatedAt(metadata)
    const createdTime = createdAt ? Date.parse(createdAt) : Number.NaN
    if (!Number.isFinite(createdTime) || createdTime > cutoff) continue

    const archivedPath = `${ARCHIVE_PREFIX}${file.name}`
    await file.move(archivedPath)
    archived.push({ from: file.name, to: archivedPath })
  }

  return { archived: archived.length, assets: archived }
}
