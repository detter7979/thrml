import { Storage } from "@google-cloud/storage"
import { createWriteStream } from "node:fs"
import { pipeline } from "node:stream/promises"
import type { Config } from "./config.js"

export class GcsClient {
  private storage: Storage
  private bucket: string

  constructor(config: Config) {
    const key = config.GCS_SERVICE_ACCOUNT_KEY.trim()
    const credentials = key.startsWith("{") ? JSON.parse(key) : undefined
    const keyFilename = !credentials ? key : undefined

    this.storage = new Storage({
      projectId: config.GCS_PROJECT_ID,
      credentials,
      keyFilename,
    })
    this.bucket = config.GCS_CREATIVE_BUCKET
  }

  get bucketName(): string {
    return this.bucket
  }

  async download(gcsPath: string, localPath: string): Promise<void> {
    const file = this.storage.bucket(this.bucket).file(gcsPath)
    const [exists] = await file.exists()
    if (!exists) {
      throw new Error(`GCS object not found: gs://${this.bucket}/${gcsPath}`)
    }
    await pipeline(file.createReadStream(), createWriteStream(localPath))
  }

  async upload(localPath: string, gcsPath: string): Promise<void> {
    await this.storage.bucket(this.bucket).upload(localPath, {
      destination: gcsPath,
      metadata: { contentType: "video/mp4" },
    })
  }
}
