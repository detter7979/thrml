import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

type Params = { id: string }

export async function GET(_: NextRequest, { params }: { params: Promise<Params> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.from("listing_reviews").select("*").eq("id", id).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Review not found" }, { status: 404 })
  return NextResponse.json({ review: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  await req.text()
  const { id } = await params
  void id
  return NextResponse.json({ error: "Reviews cannot be updated after submission." }, { status: 403 })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<Params> }) {
  const { id } = await params
  void id
  return NextResponse.json({ error: "Reviews cannot be deleted after submission." }, { status: 403 })
}
