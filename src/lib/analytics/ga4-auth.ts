// Generates a JWT and exchanges it for a Google OAuth access token
// using the service account credentials stored in env vars.
// No external JWT library needed — uses the Web Crypto API available in Node 18+.

export async function getGA4AccessToken(): Promise<string> {
  const email = process.env.GA4_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !rawKey) {
    throw new Error("GA4_SERVICE_ACCOUNT_EMAIL or GA4_SERVICE_ACCOUNT_PRIVATE_KEY not set")
  }

  const privateKeyPem = rawKey.replace(/\\n/g, "\n")

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }

  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url")

  const signingInput = `${encode(header)}.${encode(payload)}`

  const keyData = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "")

  const binaryKey = Buffer.from(keyData, "base64")
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const jwt = `${signingInput}.${Buffer.from(signature).toString("base64url")}`

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`GA4 token exchange failed: ${err}`)
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string }
  return access_token
}
