import { GoogleAuth } from 'google-auth-library'

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured')
  try {
    return JSON.parse(raw)
  } catch {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  }
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
  const location = process.env.VERTEX_AI_LOCATION || 'us-west1'
  const model = 'imagen-3.0-generate-002'  // current GA model name

  const credentials = loadCredentials()
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const accessToken = await auth.getAccessToken()
  if (!accessToken) throw new Error('Failed to obtain Vertex AI access token')

  const styleSuffix = ', photorealistic, editorial photography, warm tones, no text, no logos, cinematic, Pacific Northwest aesthetic, terracotta and cream palette, intimate lighting'
  const fullPrompt = prompt.endsWith(styleSuffix) ? prompt : prompt + styleSuffix

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ prompt: fullPrompt }],
      parameters: {
        sampleCount: opts.count,
        aspectRatio: opts.aspectRatio,
        safetyFilterLevel: 'block_some',
        personGeneration: 'dont_allow',
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Imagen REST API failed: ${response.status} ${errorText}`)
  }

  const data = await response.json() as {
    predictions: Array<{ bytesBase64Encoded: string; mimeType: string }>
  }

  return data.predictions.map(p => ({
    base64: p.bytesBase64Encoded,
    mimeType: p.mimeType || 'image/png',
  }))
}
