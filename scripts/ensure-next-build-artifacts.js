/**
 * Vercel's Next.js builder may lstat `.next/lock` after `next build`.
 * Next.js releases the lock when the build finishes, so create an empty marker
 * file for the packaging step if it is missing.
 */
const fs = require("fs")
const path = require("path")

const nextDir = path.join(process.cwd(), ".next")
const lockPath = path.join(nextDir, "lock")

fs.mkdirSync(nextDir, { recursive: true })

if (!fs.existsSync(lockPath)) {
  fs.closeSync(fs.openSync(lockPath, "a"))
}
