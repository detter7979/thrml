import type { ReactNode } from "react"

import MainLayout from "../(main)/layout"

export default function FaqLayout({ children }: { children: ReactNode }) {
  return <MainLayout>{children}</MainLayout>
}
