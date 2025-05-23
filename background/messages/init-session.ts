import type { PlasmoMessaging } from "@plasmohq/messaging"

import { supabase } from "~core/supabase"
import { DevLog } from "~utils/devUtils"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  supabase.auth.onAuthStateChange((event, session) => {
    DevLog(event, session)
  })

  await supabase.auth.setSession(req.body)

  res.send({ success: true })
}

export default handler
