import type { PlasmoMessaging } from "@plasmohq/messaging"

import { isTwitterPage } from "~companion/types"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const sender = req.sender
  if (
    sender?.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    !sender.tab?.id ||
    !isTwitterPage(sender.url || "")
  ) {
    res.send({ success: false })
    return
  }
  try {
    // Call immediately in the user gesture, before asynchronous work.
    await chrome.sidePanel.open({ windowId: sender.tab.windowId })
    res.send({ success: true })
  } catch {
    res.send({ success: false })
  }
}
export default handler
