import type { PlasmoMessaging } from "@plasmohq/messaging"
import { TwitterDataMapper } from "~InterceptorModules/utils/TwitterDataMapper"


import { DevLog } from "~utils/devUtils"
import { indexDB } from "~utils/IndexDB"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const tweet_id = req.body.originator_id
  DevLog( "Interceptor.background.message - get-intercepted-tweet: Received intercepted data:", req.body )

  try {
    DevLog(`Interceptor.background.${req.body.originator_id} - get-intercepted-tweet: Sending intercepted data to IndexDB:`, req.body.originator_id)
    
    const existingRecords = (
      await indexDB.data
        .filter((record) => record.originator_id === tweet_id)
        .sortBy("timestamp")
    ).reverse()

    DevLog(`Interceptor.background.message.${req.body.originator_id} - get-intercepted-tweet: Existing records:`,JSON.stringify(existingRecords))

    if(existingRecords.length === 0){
      res.send({ success: false, error: "No records found" })
      return
    }

    const tweetRecord = existingRecords[0]

    const items = TwitterDataMapper.mapAll(tweetRecord.data)
    const tweet = items[0].tweet

    res.send({ success: true, tweet: tweet, date_added: tweetRecord.date_added, date_sent: tweetRecord.timestamp, reason: tweetRecord.reason, canSendToCA: tweetRecord.canSendToCA})
  } catch (error) {

    DevLog(`Interceptor.background.message.${req.body.originator_id} - Error getting tweet ${tweet_id}: ${error.message}`, "error")
    res.send({ success: false, error: error.message })
  }

}

export default handler
