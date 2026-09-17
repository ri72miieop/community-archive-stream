import { sendToBackground } from "@plasmohq/messaging"

import Companion, { type CompanionAPI } from "~companion/Companion"

import "~companion/companion.css"

const api: CompanionAPI = {
  async request(action, body = {}) {
    const response = await sendToBackground({
      name: "companion",
      body: { action, ...body }
    })
    if (!response.ok) throw new Error(response.error)
    return response.data
  },
  async activeTab() {
    return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
      ?.id
  },
  openSettings() {
    chrome.runtime.openOptionsPage()
  }
}
export default function SidePanel() {
  return <Companion api={api} />
}
