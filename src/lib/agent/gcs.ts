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

function createStorageClient() {
  const encoded = requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON")
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as Record<string, unknown>
  return new Storage({ credentials })
}

function getBucket() {
  return createStorageClient().bucket(requireEnv("GCS_BUCKET_NAME"))
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
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsPath)
  if (!match) throw new Error(`Invalid GCS path: ${gcsPath}`)
  return { bucketName: match[1], objectPath: match[2] }
}

async function signedReadUrl(file: ReturnType<ReturnType<typeof getBucket>["file"]>) {
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + SIGNED_URL_EXPIRES_MS,
  })
  return url
}

export async function downloadCreativeAsset(gcsPath: string): Promise<DownloadedCreativeAsset> {
  const { bucketName, objectPath } = parseGcsPath(gcsPath)
  const configuredBucket = requireEnv("GCS_BUCKET_NAME")
  if (bucketName !== configuredBucket) {
    throw new Error(`GCS path bucket ${bucketName} does not match configured bucket ${configuredBucket}`)
  }

  const file = getBucket().file(objectPath)
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
  return /^\d{4}-\d{2}$/.test(parts[0] ?? "") && parts[2] === briefId && parts.length >= 5
}

export async function uploadCreativeAsset(
  buffer: Buffer,
  opts: UploadCreativeAssetOptions
): Promise<UploadedCreativeAsset> {
  const bucket = getBucket()
  const bucketName = bucket.name
  const objectPath = [
    monthPath(),
    pathSegment(opts.campaignShortName, "campaignShortName"),
    pathSegment(opts.briefId, "briefId"),
    kindFolder(opts.kind),
    pathSegment(opts.filename, "filename"),
  ].join("/")
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
