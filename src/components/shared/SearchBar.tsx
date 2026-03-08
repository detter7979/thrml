"use client"

import { useState } from "react"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"

export function SearchBar({
  placeholder = "Search services, cities, amenities...",
}: {
  placeholder?: string
}) {
  const [value, setValue] = useState("")

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(event) => setValue(event.target.value)} className="pl-9" placeholder={placeholder} />
    </div>
  )
}
