import type { PlasmoMessaging } from "@plasmohq/messaging"

import { supabase } from "~core/supabase"

// Compatibility for extension-owned pages only. Never log session credentials.
const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  if (
    req.sender?.id !== chrome.runtime.id ||
    req.sender?.url !== chrome.runtime.getURL("options.html")
  ) {
    res.send({ success: false })
    return
  }
  // Sessions are now created by the background PKCE flow; no tokens accepted
  // from message bodies (including website/content-script messages).
  const { data, error } = await supabase.auth.getSession()
  res.send({ success: !error && !!data.session })
}
export default handler
