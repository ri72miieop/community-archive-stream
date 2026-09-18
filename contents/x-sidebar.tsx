import caLogo from "data-base64:~assets/ca-logo.png"
import cssText from "data-text:~/contents/x-sidebar.css"
import type { PlasmoCSConfig } from "plasmo"
import { useState } from "react"

import { sendToBackground } from "@plasmohq/messaging"

export const config: PlasmoCSConfig = {
  matches: [
    "https://x.com/*",
    "https://www.x.com/*",
    "https://twitter.com/*",
    "https://www.twitter.com/*"
  ]
}
export const getShadowHostId = () => "ca-companion-launcher"
export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

export default function CompanionLauncher() {
  const [error, setError] = useState("")
  async function open() {
    try {
      const result = await sendToBackground({
        name: "open-sidepanel",
        body: { open: true }
      })
      if (!result.success) throw new Error()
      setError("")
    } catch {
      setError("Open Community Archive from the browser toolbar.")
    }
  }
  return (
    <div className="ca-launcher">
      <button
        onClick={open}
        title="Open Community Archive companion"
        aria-label="Open Community Archive companion">
        <img src={caLogo} alt="" width={24} height={24} /> Archive
      </button>
      {error && <p role="status">{error}</p>}
    </div>
  )
}
