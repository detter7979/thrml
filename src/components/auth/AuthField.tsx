import type { ComponentProps } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { authFieldClassName } from "./auth-field-styles"

export function AuthField({
  id,
  label,
  className,
  ...props
}: ComponentProps<typeof Input> & { label: string }) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-")

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId} className="text-sm font-medium text-[#1A1410]">
        {label}
      </Label>
      <Input id={fieldId} className={cn(authFieldClassName, className)} {...props} />
    </div>
  )
}
