import type { PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"

import { getUser, type UserMinimal } from "~utils/dbUtils"
import { DevLog, isDev } from "~utils/devUtils"

import { GlobalCachedData } from "./Storage/CachedData"

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
      const user: UserMinimal = await getUser()
      //if(!user) throw new Error("User not found")
      const userid = user?.id || "anon"

      let data = event.detail.data
      let type = event.detail.type
      try {
        const dataObject = data

        const response = await sendToBackground({
          name: "send-intercepted-data",
          body: {
            data: dataObject,
            type: type,
            originator_id: event.detail.originator_id,
            item_id: event.detail.item_id,
            timestamp: dataObject.timestamp,
            userid: userid,
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


  if(isDev){
    window.addEventListener("send-to-storage", async (event: CustomEvent<SendToStorageEventProps>) => {
      const filename = event.detail.filename
      const rawJson = event.detail.rawJson

      try{
        const response = await sendToBackground({
          name: "send-to-storage",
          body: {
            filename: filename,
            rawJson: rawJson
          }
        })
      } catch (error) {
        console.error(
          "Interceptor.extension.event.send-to-storage - Error sending data to background:",
          error
        )
      } 
  })}
}

init()


export interface SendToStorageEventProps {
  filename: string
  rawJson: string
}
