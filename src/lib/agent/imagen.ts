import { GoogleAuth } from 'google-auth-library'

/**
 * Static-ad image generation on Vertex AI.
 *
 * Google retired every Imagen model (imagen-3.0-*, imagen-4.0-*) on June 30, 2026 and points to the
 * Gemini image models ("Nano Banana") instead. Those use generateContent rather than :predict and
 * return one image per request, so `count` images are requested in parallel.
 *
 * The model can be pinned with VERTEX_IMAGE_MODEL. Otherwise the candidates below are tried in order,
 * on the global endpoint first and then the configured region, and the first that answers is
 * remembered for the life of the serverless instance — so a later rename/retirement degrades to the
 * next candidate instead of breaking the pipeline.
 */
const DEFAULT_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
]

const STYLE_SUFFIX =
  ', photorealistic, editorial photography, warm tones, no text, no logos, cinematic, Pacific Northwest aesthetic, terracotta and cream palette, intimate lighting'
/** Imagen took personGeneration: 'dont_allow'; Gemini image models are steered by the prompt instead. */
const NO_PEOPLE = ', no people, no faces, no human figures'

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured')
  try {
    return JSON.parse(raw)
  } catch {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  }
}

type Target = { model: string; location: string }
let workingTarget: Target | null = null

function candidateTargets(): Target[] {
  const pinned = process.env.VERTEX_IMAGE_MODEL?.trim()
  const models = pinned ? [pinned] : DEFAULT_MODELS
  const region = process.env.VERTEX_AI_LOCATION?.trim() || 'us-central1'
  const locations = Array.from(new Set(['global', region, 'us-central1']))
  const out: Target[] = []
  for (const model of models) for (const location of locations) out.push({ model, location })
  return workingTarget ? [workingTarget, ...out.filter((t) => t.model !== workingTarget!.model || t.location !== workingTarget!.location)] : out
}

function endpoint(projectId: string, t: Target) {
  const host = t.location === 'global' ? 'aiplatform.googleapis.com' : `${t.location}-aiplatform.googleapis.com`
  return `https://${host}/v1/projects/${projectId}/locations/${t.location}/publishers/google/models/${t.model}:generateContent`
}

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> }
  }>
  promptFeedback?: { blockReason?: string }
}

class ModelUnavailable extends Error {}

async function generateOne(
  projectId: string,
  accessToken: string,
  t: Target,
  prompt: string,
  aspectRatio: string
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(endpoint(projectId, t), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    // Unknown model / not offered in this location / not enabled for the project → try the next target.
    if (res.status === 404 || (res.status === 400 && /not (found|supported)|unsupported|invalid model/i.test(text))) {
      throw new ModelUnavailable(`${t.model}@${t.location}: ${res.status}`)
    }
    throw new Error(`Gemini image API failed (${t.model}@${t.location}): ${res.status} ${text.slice(0, 500)}`)
  }

  const data = (await res.json()) as GeminiResponse
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const image = parts.find((p) => p.inlineData?.data)
  if (!image?.inlineData?.data) {
    const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? 'no image returned'
    throw new Error(`Gemini image API returned no image (${t.model}): ${reason}`)
  }
  return { base64: image.inlineData.data, mimeType: image.inlineData.mimeType || 'image/png' }
}

export async function generateImagen(
  prompt: string,
  opts: {
    aspectRatio: '1:1' | '9:16' | '4:5'
    count: 1 | 2 | 3 | 4
  }
): Promise<{ base64: string; mimeType: string }[]> {
  const projectId = process.env.VERTEX_AI_PROJECT_ID
  if (!projectId) {
    throw new Error('VERTEX_AI_PROJECT_ID env var is required')
  }

  const auth = new GoogleAuth({
    credentials: loadCredentials(),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const accessToken = await auth.getAccessToken()
  if (!accessToken) throw new Error('Failed to obtain Vertex AI access token')

  let fullPrompt = prompt.endsWith(STYLE_SUFFIX) ? prompt : prompt + STYLE_SUFFIX
  if (!fullPrompt.includes(NO_PEOPLE)) fullPrompt += NO_PEOPLE

  const tried: string[] = []
  for (const target of candidateTargets()) {
    try {
      // Probe with the first image, then fetch the rest in parallel on the target that worked.
      const first = await generateOne(projectId, accessToken, target, fullPrompt, opts.aspectRatio)
      workingTarget = target
      const rest = await Promise.all(
        Array.from({ length: opts.count - 1 }, () =>
          generateOne(projectId, accessToken, target, fullPrompt, opts.aspectRatio)
        )
      )
      return [first, ...rest]
    } catch (e) {
      if (e instanceof ModelUnavailable) {
        tried.push(e.message)
        if (workingTarget && workingTarget.model === target.model && workingTarget.location === target.location) {
          workingTarget = null
        }
        continue
      }
      throw e
    }
  }

  throw new Error(
    `No Gemini image model is available to project ${projectId}. Tried: ${tried.join('; ')}. ` +
      'Enable the Vertex AI API and check the model is offered for the project, or set VERTEX_IMAGE_MODEL.'
  )
}
