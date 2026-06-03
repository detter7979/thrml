export async function readApiErrorResponse(
  response: Response,
  fallback = "Request failed."
): Promise<{ message: string; code: string | null }> {
  let text = ""
  try {
    text = await response.text()
  } catch {
    return { message: fallback, code: null }
  }

  if (!text.trim()) {
    return { message: fallback, code: null }
  }

  try {
    const data = JSON.parse(text) as { error?: unknown; code?: unknown }
    const message =
      typeof data.error === "string" && data.error.trim().length > 0 ? data.error : fallback
    const code = typeof data.code === "string" ? data.code : null
    return { message, code }
  } catch {
    if (text.trim().startsWith("<")) {
      return { message: fallback, code: null }
    }
    return { message: text.slice(0, 400), code: null }
  }
}

export async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  let text = ""
  try {
    text = await response.text()
  } catch {
    return null
  }
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export function formatApiErrorMessage(message: string, code: string | null) {
  return code ? `${message} (${code})` : message
}
