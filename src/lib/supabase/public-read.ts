import { createClient } from "@supabase/supabase-js"

/**
 * Anon Supabase client without Next cookies/session.
 * Use for public reads where RLS allows anonymous `select`, so pages can use ISR / static generation.
 */
export function createPublicReadSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}
