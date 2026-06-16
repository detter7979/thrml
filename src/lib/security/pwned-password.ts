import { createHash } from "node:crypto"

export type PwnedPasswordResult = {
  pwned: boolean
  errored: boolean
}

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/"

export async function checkPwnedPassword(password: string): Promise<PwnedPasswordResult> {
  try {
    const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase()
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)

    const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      headers: {
        "Add-Padding": "true",
      },
    })

    if (!response.ok) {
      return { pwned: false, errored: true }
    }

    const body = await response.text()
    const pwned = body.split("\n").some((line) => {
      const [hashSuffix] = line.split(":")
      return hashSuffix === suffix
    })

    return { pwned, errored: false }
  } catch {
    return { pwned: false, errored: true }
  }
}
