import { PredictionServiceClient } from "@google-cloud/aiplatform"

const IMAGEN_MODEL = "imagegeneration@006"
const BASE_PROMPT_SUFFIX = ", photorealistic, editorial photography, warm tones, no text, no logos, cinematic"
const BRAND_PROMPT_SUFFIX = ", Pacific Northwest aesthetic, terracotta and cream palette, intimate lighting"

type AspectRatio = "1:1" | "9:16" | "4:5"
type ImagenCount = 1 | 2 | 3 | 4

export type GenerateImagenOptions = {
  aspectRatio: AspectRatio
  count: ImagenCount
  guidanceScale?: number
}

export type ImagenResult = {
  base64: string
  mimeType: string
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function createImagenClient() {
  const encoded = requireEnv("GCS_SERVICE_ACCOUNT_KEY")
  const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf-8")) as Record<string, unknown>
  const location = requireEnv("VERTEX_AI_LOCATION")

  return new PredictionServiceClient({
    apiEndpoint: `${location}-aiplatform.googleapis.com`,
    credentials,
  })
}

function valueToPlain(value: unknown): unknown {
  if (!value || typeof value !== "object") return value

  const maybeJson = value as { toJSON?: () => unknown }
  if (typeof maybeJson.toJSON === "function") return maybeJson.toJSON()

  const record = value as Record<string, unknown>

  if ("stringValue" in record) return record.stringValue
  if ("numberValue" in record) return record.numberValue
  if ("boolValue" in record) return record.boolValue
  if ("nullValue" in record) return null

  const listValue = record.listValue as { values?: unknown[] } | undefined
  if (listValue?.values) return listValue.values.map(valueToPlain)

  const structValue = record.structValue as { fields?: Record<string, unknown> } | undefined
  if (structValue?.fields) {
    return Object.fromEntries(Object.entries(structValue.fields).map(([key, field]) => [key, valueToPlain(field)]))
  }

  return value
}

function readStringField(obj: unknown, keys: string[]) {
  if (!obj || typeof obj !== "object") return null
  const record = obj as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value
  }

  return null
}

function parseImagenPrediction(prediction: unknown): ImagenResult {
  const plain = valueToPlain(prediction)
  const base64 = readStringField(plain, ["bytesBase64Encoded", "base64", "imageBytes"])
  const mimeType = readStringField(plain, ["mimeType", "mime_type"]) ?? "image/png"

  if (!base64) {
    throw new Error("Imagen response did not include base64 image data")
  }

  return { base64, mimeType }
}

export async function generateImagen(prompt: string, opts: GenerateImagenOptions): Promise<ImagenResult[]> {
  const project = requireEnv("VERTEX_AI_PROJECT_ID")
  const location = requireEnv("VERTEX_AI_LOCATION")
  const client = createImagenClient()
  const endpoint = `projects/${project}/locations/${location}/publishers/google/models/${IMAGEN_MODEL}`
  const fullPrompt = `${prompt}${BASE_PROMPT_SUFFIX}${BRAND_PROMPT_SUFFIX}`
  const parameters: Record<string, unknown> = {
    sampleCount: opts.count,
    aspectRatio: opts.aspectRatio,
  }

  if (opts.guidanceScale !== undefined) {
    parameters.guidanceScale = opts.guidanceScale
  }

  const predict = client.predict as unknown as (request: {
    endpoint: string
    instances: Array<Record<string, unknown>>
    parameters: Record<string, unknown>
  }) => Promise<[{ predictions?: unknown[] }]>

  // Imagen costs roughly $0.02/image; keep testing volume below 100 images/day.
  const [response] = await predict({
    endpoint,
    instances: [{ prompt: fullPrompt }],
    parameters,
  })

  return (response.predictions ?? []).map(parseImagenPrediction)
}
