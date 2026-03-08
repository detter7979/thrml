import { NextResponse } from "next/server"

import { getServiceTypes } from "@/lib/supabase/queries"

export async function GET() {
  const serviceTypes = await getServiceTypes()
  return NextResponse.json({ serviceTypes })
}
