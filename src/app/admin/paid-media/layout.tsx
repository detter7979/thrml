import { PaidMediaTabNav } from "./tab-nav"

export default function PaidMediaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0">
      <div className="border-b border-[#E7DACA] bg-[#FCF8F3] px-6 pt-3">
        <PaidMediaTabNav />
      </div>
      {children}
    </div>
  )
}
