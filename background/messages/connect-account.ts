import type { PlasmoMessaging } from "@plasmohq/messaging"

import { startLogin } from "~companion/auth-service"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  if (
    req.sender?.id !== chrome.runtime.id ||
    req.sender?.url !== chrome.runtime.getURL("options.html")
  ) {
    res.send({
      ok: false,
      error: "Open extension settings to connect your account."
    })
    return
  }
  try {
    await startLogin()
    res.send({ ok: true })
  } catch {
    res.send({ ok: false, error: "Could not start sign-in. Please try again." })
  }
}
export default handler
