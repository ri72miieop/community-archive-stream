import { supabase } from "~core/supabase"

import { createArchiveClient } from "./archive-client"
import { type ArchiveInput } from "./archive-contract"

const read = createArchiveClient()
export async function archive(input: ArchiveInput) {
  if (input.feature !== "trends") return read(input)
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || data.session.user.is_anonymous)
    throw new Error("Sign in to Community Archive to explore trends.")
  return read(input, data.session.access_token, data.session.user.id)
}
