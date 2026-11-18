import { sendEmail, type SendEmailParams, type SendEmailResult } from "@/lib/emails/send"
import { buildPlainText, renderThrmlEmail, type ThrmlEmailLayoutProps } from "@/lib/emails/render-layout"
import { sendPushToUser } from "@/lib/push/send"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

/**
 * `push` mirrors the email as a phone notification in the iOS app (same recipient and same
 * preference key). `true` builds it from the email: kicker as the title, the email's preview line
 * as the text, and the email's button link as where a tap goes.
 */
type PushOption = true | { title: string; body: string; url?: string; threadId?: string }

export async function sendThrmlLayoutEmail(
  params: Omit<SendEmailParams, "html" | "text"> & { layout: ThrmlEmailLayoutProps; push?: PushOption }
): Promise<SendEmailResult> {
  const layout = { ...params.layout, appUrl: params.layout.appUrl ?? APP_URL }
  const html = await renderThrmlEmail(layout)
  const text = buildPlainText(layout)
  const { layout: _layout, push, ...sendParams } = params
  const result = await sendEmail({ ...sendParams, html, text })

  if (push && params.userId) {
    const message =
      push === true
        ? { title: layout.kicker ?? layout.title, body: layout.preview || layout.title, url: layout.cta?.href }
        : push
    await sendPushToUser(params.userId, { ...message, preferenceKey: params.preferenceKey })
  }

  return result
}

export { APP_URL as THRML_APP_URL }
