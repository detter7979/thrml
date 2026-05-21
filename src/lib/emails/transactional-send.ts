import { sendEmail, type SendEmailParams, type SendEmailResult } from "@/lib/emails/send"
import { buildPlainText, renderThrmlEmail, type ThrmlEmailLayoutProps } from "@/lib/emails/render-layout"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

export async function sendThrmlLayoutEmail(
  params: Omit<SendEmailParams, "html" | "text"> & { layout: ThrmlEmailLayoutProps }
): Promise<SendEmailResult> {
  const layout = { ...params.layout, appUrl: params.layout.appUrl ?? APP_URL }
  const html = await renderThrmlEmail(layout)
  const text = buildPlainText(layout)
  const { layout: _layout, ...sendParams } = params
  return sendEmail({ ...sendParams, html, text })
}

export { APP_URL as THRML_APP_URL }
