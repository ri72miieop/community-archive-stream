import type { PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"
import { DevLog } from "~utils/devUtils"

export const config: PlasmoCSConfig = {
  matches: ["https://*.x.com/*"],
  run_at: "document_start"
}

async function init() {
  DevLog("Initializing extension intercept")

  // In your extension's content script
  window.addEventListener(
    "dataInterceptedEvent",
    async (event: CustomEvent) => {
      
      let data = event.detail.data
      let type = event.detail.type
      try {
        const dataObject = data

        await sendToBackground({
          name: "send-intercepted-data-raw",
          body: {
            data: dataObject,
            type: type,
            timestamp: dataObject.timestamp,
            date_added: new Date().toISOString()
          }
        })
      } catch (error) {
        console.error(
          "Interceptor.extension.event - Error sending data to background:",
          error
        )
      }
    }
  )
}

init()
