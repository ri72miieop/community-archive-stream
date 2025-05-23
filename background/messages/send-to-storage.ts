import type { PlasmoMessaging } from "@plasmohq/messaging"
import { supabase } from "~core/supabase"

import { DevLog } from "~utils/devUtils"


const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const filename = req.body.filename
  const rawJson = req.body.rawJson
  

  try {
    DevLog(`Interceptor.background.sendtostorage.${filename} - send-to-storage: Sending filename to IndexDB:`, filename)
    DevLog(`Interceptor.background.sendtostorage.${filename}.inserting filename: ${filename} data: ${rawJson}`)
    const { error } = await supabase.storage
        .from("debug")
        .upload(filename, rawJson, {
          contentType: 'application/json',
          upsert: true,
        });

    if(error) {
      DevLog(`Interceptor.background.sendtostorage.${filename} - Error sending filename ${filename}: ${JSON.stringify(error)}`, "error")
      res.send({ success: false, error: error.message })
    } else {
      DevLog(`Interceptor.background.sendtostorage.${filename} - File uploaded to storage`, "success")
      res.send({ success: true, message: "File uploaded to storage" })
    }
  } catch (error) {

    DevLog(`Interceptor.background.sendtostorage.${filename} - Error sending filename ${filename}: ${JSON.stringify(error)}`, "error")
    res.send({ success: false, error: error.message })
  }

}

export default handler
