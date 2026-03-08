import Link from "next/link"

import { Button } from "@/components/ui/button"

export function ListingForm() {
  return (
    <div className="card-base space-y-3 p-5">
      <p className="type-body">
        Host listing form is implemented at <code>/dashboard/host/new</code>.
      </p>
      <Button className="btn-primary" asChild>
        <Link href="/dashboard/host/new">Open listing wizard</Link>
      </Button>
    </div>
  )
}
