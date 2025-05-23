import type { PlasmoMessaging } from "@plasmohq/messaging"

import { GlobalCachedData } from "~contents/Storage/CachedData"
import posthog from "~core/posthog"
import { supabase } from "~core/supabase"
import type { Tweet, TweetUnion, TweetWithVisibilityResults } from "~InterceptorModules/types/tweet"
import type { User } from "~InterceptorModules/types/user"
import { TwitterDataMapper } from "~InterceptorModules/utils/TwitterDataMapper"
import type { UserMinimal } from "~utils/dbUtils"
import { getUser } from "~utils/dbUtils"
import { DevLog, PLASMO_PUBLIC_RECORD_EXPIRY_SECONDS } from "~utils/devUtils"
import { indexDB, type TimedObject } from "~utils/IndexDB"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const type = req.body.type
  DevLog(
    "Interceptor.background.message - send-intercepted-data: Received intercepted data:",
    req.body
  )

  DevLog(
    "Interceptor.background.message - send-intercepted-data: Sending intercepted data to IndexDB:",
    req.body.originator_id
  )

  try {
    DevLog(
      "Interceptor.background.message - send-intercepted-data: Sending intercepted data to IndexDB:",
      req.body.originator_id
    )
    const result = await processInterceptedData(
      req.body.data,
      type,
      req.body.originator_id,
      req.body.item_id,
      req.body.userid,
      req.body.date_added
    )
    let resObject;
    if (result.success) {
      resObject = { success: true }
    } else {
      resObject = { success: false, error: result.reason }
    }
    DevLog("Interceptor.background.message - send-intercepted-data: result of sending intercepted data to IndexDB:", resObject)
    res.send(resObject)

  } catch (error) {
    DevLog(`Error processing ${type}: ${error.message}`, "error")
    res.send({ success: false, error: error.message })
  }
}

async function processInterceptedData(
  data: any,
  type: string,
  originator_id: string,
  item_id: string,
  userid: string,
  date_added: string
): Promise<{success: boolean, reason?: string}> {
  DevLog("Processing intercepted data", originator_id)
  
  // Check for duplicates
  const existingRecords = await indexDB.data
    .filter(
      (record) =>
        record.originator_id === originator_id &&
        record.item_id === item_id &&
        record.type === type
    )
    .sortBy("timestamp")

  // Check DB for recent records
  const expirySeconds = PLASMO_PUBLIC_RECORD_EXPIRY_SECONDS
  const expiryTime = Date.now() - expirySeconds * 1000

  // Get fresh preference value instead of using cached version
  const canIntercept = await GlobalCachedData.GetCanIntercept(userid);
  const userpreferences = await GlobalCachedData.GetEnhancementPreferences();
  const canSendToCA = userpreferences.interceptData;
  const itemType = type.startsWith("api_") ? type : `api_${type}`
  
  const recordId = await indexDB.data.put({
    timestamp: null,
    type: itemType,
    originator_id,
    item_id,
    data,
    user_id: userid,
    canSendToCA: canIntercept && canSendToCA,
    date_added
  })
  const jsonData = JSON.stringify(data);
  if (jsonData.includes('trusted_friends_info_result')){
    const errorMsg = "[Current Data Policy] Tweet rejected because it might be a circle tweet.";
    await indexDB.data.update(recordId, {
      canSendToCA: false,
      reason: errorMsg
    })
    return {success: false, reason: errorMsg}
  }

  const { data: dbData } = await supabase
    .from("temporary_data")
    .select("originator_id,item_id,timestamp")
    .eq("originator_id", originator_id)
    .eq("item_id", item_id)
    .eq("type", itemType)
    .order("timestamp", { ascending: false })
    .limit(1)

    
  if (dbData?.length > 0 && dbData[0]?.timestamp) {
    DevLog("record_check: Found existing record in DB:", {
      timestamp: dbData[0].timestamp,
      isRecent: new Date(dbData[0].timestamp).getTime() > expiryTime,
      isNewerThanCurrent: new Date(dbData[0].timestamp).getTime() > new Date(date_added).getTime()
    })
  } else {
    DevLog("record_check: No existing record found in DB")
  }

  // skip if already there's a record more recent than the one we are trying to (re)process
  if (
    dbData?.length > 0 &&
    dbData[0].timestamp &&
    new Date(dbData[0].timestamp).getTime() > new Date(date_added).getTime()
  ) {
    DevLog(`Record is more recent than the one we are trying to (re)process, skipping: ${originator_id}`)
    const errorMsg = "[Current Data Policy] This record is outdated and a more recent record already exists.";
    await indexDB.data.update(recordId, {
      canSendToCA: false,
      reason: errorMsg
    })
    return {success: false, reason: errorMsg}
  }


  // Skip if recent record exists in DB
  //TODO: change this to have a dynamic expiry based on the age of the tweet, if the tweet is older than 1y there's not much value in still sending one file each X minutes
  if (
    dbData?.length > 0 &&
    dbData[0].timestamp &&
    new Date(dbData[0].timestamp).getTime() > expiryTime
  ) {
    DevLog(`Record is too recent in DB, skipping: ${originator_id}`)
    const errorMsg = "[Current Data Policy] This record was already sent recently.";
    await indexDB.data.update(recordId, {
      canSendToCA: false,
      reason: errorMsg
    })
    return {success: false, reason: errorMsg}
  }

  

  if (!canIntercept || !canSendToCA) {
    DevLog("User blocked from intercepting or cannot send to CA")
    DevLog("user preferences: " + JSON.stringify(userpreferences) + " canSendToCA " + canSendToCA + " canIntercept " + canIntercept)
    const errorMsg = canIntercept ? "User has disabled sending data to CA" : "User blocked from sending data to CA";
    await indexDB.data.update(recordId, {
      canSendToCA: false,
      reason: errorMsg
    })
    return {success: false, reason: errorMsg}
  }

  // Create record with current timestamp
  const timestamp = new Date().toISOString()
  const recordToProcess: TimedObject = {
    timestamp,
    type: type.startsWith("api_") ? type : `api_${type}`,
    originator_id,
    item_id,
    data,
    user_id: await hashUserId(userid)
  }

  try {
   
    const processResult = await processType(
      recordToProcess.type,
      recordToProcess.data,
      recordToProcess.user_id
    )

    const shouldUpload = processResult.success;
    DevLog(
      "Interceptor.background.processRecordsIndexDB - shouldUpload:" +
        shouldUpload
    )

    if (shouldUpload) {
      // Upload to Supabase
      const { error } = await supabase
        .from("temporary_data")
        .insert(recordToProcess)
        .select()

      if (error) {
        DevLog(`Error uploading to Supabase: ${error.message}`, "warn")
        const errorMsg = `Error uploading to Supabase`;
        await indexDB.data.update(recordId, { canSendToCA: false, reason: errorMsg })
        
        posthog.capture("error-upload", {
          error: error.details,
          errorCode: `error.${error.code}`,
          errorHint: error.hint,
          type: recordToProcess.type,
          originator_id: recordToProcess.originator_id,
          item_id: recordToProcess.item_id,
          userId: recordToProcess.user_id,
          timestamp: recordToProcess.timestamp
        })
        return {success: false, reason: errorMsg}
      }
      // Update IndexDB with processed timestamp
      await indexDB.data.update(recordId, { timestamp })
      
    } else {
      await indexDB.data.update(recordId, { canSendToCA: false, reason: processResult.reason })
      return {success: false, reason: processResult.reason}
    }
  } catch (error) {
    DevLog(`Error uploading to Supabase: ${error.message}`, "warn")
    const errorMsg = "Error uploading to Supabase";
    await indexDB.data.update(recordId, { canSendToCA: false, reason: errorMsg })


    posthog.capture("error-upload", {
      error: error.message,
      errorCode: `${Date.now()}_${recordToProcess.user_id}`,
      type: recordToProcess.type,
      originator_id: recordToProcess.originator_id,
      item_id: recordToProcess.item_id,
      userId: recordToProcess.user_id,
      timestamp: recordToProcess.timestamp
    })

    return {success: false, reason: errorMsg}
  }

  DevLog(`Successfully processed data for: ${originator_id}`)
  return {success: true}
}

async function hashUserId(userId: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(userId.toString())
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  } catch (error) {
    console.error("Error hashing userId:", error)
    throw error
  }
}

async function isLoggedInUser(userId: string) {
  const user = await getUser();
  return user && user.id === userId;
}

async function isValidUserMentioned(userId: string) {
  const userMention = await indexDB.userMentions.get(userId)

  if (userMention) {
    const mentionTime = new Date(userMention.timestamp)
    const currentTime = new Date()
    const timeDiff = currentTime.getTime() - mentionTime.getTime()
    const hoursDiff = timeDiff / (1000 * 60 * 60)

    if (hoursDiff <= 24) {
      return true
    }
  }
  const { data, error } = await supabase
    .from("mentioned_users")
    .select("*")
    .eq("user_id", userId)
  if (error) {
    DevLog(
      "Interceptor.background.isValidUserMentioned - Error fetching user mentions:" +
        error
    )
    return false
  }
  if (data.length > 0) {
    const items = data.map((user) => ({
      id: user.user_id,
      timestamp: new Date().toISOString()
    }))
    await indexDB.userMentions.bulkPut(items)
    return true
  }
}

function getQuotedUserId(item: Tweet): string | null {
  const QT = item.quoted_status_result?.result;
  if(!QT) return null;
  
  switch (QT.__typename) {
    case "Tweet":
      let tweet = QT as Tweet;
      return tweet.core.user_results.result.rest_id;
    case "TweetWithVisibilityResults":
      let tweetWithVisibilityResults = QT as TweetWithVisibilityResults;
      return tweetWithVisibilityResults.tweet.core.user_results.result.rest_id;
    default:
      return null;
  }
}

function isQTUserProtected(tweet: Tweet): boolean {
  const QT = tweet.quoted_status_result?.result;
  if(!QT) return false;
  
  switch (QT.__typename) {
    case "Tweet":
      let tweet = QT as Tweet;
      return tweet.core.user_results.result.legacy.protected;
    case "TweetWithVisibilityResults":
      let tweetWithVisibilityResults = QT as TweetWithVisibilityResults;
      return tweetWithVisibilityResults.tweet.core.user_results.result.legacy.protected;
    default:
      return false;
  }
}

async function processType(type: string, data: any, hashed_userid: string) {
  try {
    switch (type) {
      case "api_notifications":
        DevLog("Interceptor.background.process.notifications - Processing notifications:" + JSON.stringify(data))
        break
      case "api_tweet-detail":
      case "api_home-timeline":
      case "api_user-tweets":
      case "api_search-timeline":
        const itemToProccess = data as Tweet
        DevLog(
          "Interceptor.background.process.home-timeline - Processing tweet:" +
            itemToProccess.rest_id
        )
        if (itemToProccess.core.user_results.result.legacy.protected || isQTUserProtected(itemToProccess)) {
          DevLog(
            "Interceptor.background.process.home-timeline - Skipping protected account:" +
              itemToProccess.rest_id
          )
          return {success: false, reason: "Protected account"}
        }
        const userId = itemToProccess.core.user_results.result.rest_id
        DevLog(
          "Interceptor.background.process.validateUserMention - JSON:" +
            JSON.stringify(itemToProccess.core.user_results.result)
        )

        const quotedUserID = getQuotedUserId(itemToProccess);
        const isValidQuotedUser = quotedUserID && (await isLoggedInUser(quotedUserID) || await isValidUserMentioned(quotedUserID)) ;
        const isValidUser = await isLoggedInUser(userId) || await isValidUserMentioned(userId) || isValidQuotedUser;

        DevLog(
          `Interceptor.background.process.validateUserMention.${userId}.check`
        )
        if (!isValidUser) {
          DevLog(
            `Interceptor.background.process.validateUser.${userId}.no`
          )
          return {success: false, reason: "[Current Data Policy] User has not been mentioned in the CA."}
        } else {
          DevLog(
            `Interceptor.background.process.validateUser.${userId}.yes`
          )
        }


        await processTweet(itemToProccess, hashed_userid)
        break

      case "api_following":
      case "api_followers":
        const userToProcess = data as User
        await processUser(userToProcess)
        break
    }
  } catch (error) {
    DevLog(
      `Interceptor.background.process.error.${type} - Error processing tweet:${error}`
    )
    let errorCode = `${Date.now()}_${hashed_userid}`
    posthog.capture("process_type_error", {
      error: error.message,
      errorCode,
      type,
      userid: hashed_userid,
      data: JSON.stringify(data)
    })
    return {success: false, reason: "Error processing tweet."}

  }
  return {success: true}

}

async function processUser(data: User) {
  DevLog(
    "Interceptor.background.process_user - Starting with data: " +
      JSON.stringify(data)
  )
}

async function processTweet(data: Tweet, hashed_userid: string) {
  DevLog(
    "Interceptor.background.process_json - Starting with data: " +
      JSON.stringify(data)
  )

  const items = TwitterDataMapper.mapAll(data)
  DevLog("got " + items.length + " items in processJSON", items)
  let originator_id = data.rest_id
  const timestamp = new Date().toISOString()

  // Create arrays to hold all items for bulk insert
  const recordsToInsert: TimedObject[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const { account, profile, tweet, media, urls, mentions,extraInfo } = item

    let suffix = i==0 ? "" : i>0?`_${extraInfo}`:`_${extraInfo}${i}`
    // Account

    if (account) {
      recordsToInsert.push({
        timestamp: timestamp,
        type: "import_account",
        item_id: account.account_id+suffix,
        originator_id,
        user_id: hashed_userid,
        data: account
      })
    }

    // Profile
    if (profile) {
      recordsToInsert.push({
        timestamp: timestamp,
        type: "import_profile",
        item_id: profile.account_id+suffix,
        originator_id,

        user_id: hashed_userid,
        data: profile
      })
    }

    // Tweet
    recordsToInsert.push({
      timestamp: timestamp,
      type: "import_tweet",
      item_id: tweet.tweet_id+suffix,
      originator_id,
      user_id: hashed_userid,
      data: tweet
    })

    // Media
    if (media?.length) {
      recordsToInsert.push(
        ...media.map((m) => ({
          timestamp: timestamp,
          type: "import_media",
          item_id: m.media_id.toString()+suffix,
          originator_id,
          user_id: hashed_userid,
          data: m
        }))
      )
    }

    // URLs
    if (urls?.length) {
      //due to tweet_urls not having an ID we need to put the # of the tweet_url in the item_id
      let url_id = 0;
      recordsToInsert.push(
        ...urls.map((u) => ({
          timestamp: timestamp,
          type: "import_url",
          item_id: (url_id++).toString()+suffix,
          originator_id,
          user_id: hashed_userid,
          data: u
        }))
      )
    }

    // Mentions
    if (mentions?.length) {
      recordsToInsert.push(
        ...mentions.map((m) => ({
          timestamp: timestamp,
          type: "import_mention",
          item_id: m.mentioned_user_id+suffix,
          originator_id,
          user_id: hashed_userid,
          data: m
        }))
      )
    }
  }
  let batch = null;
  try {
    DevLog(`Attempting to insert ${recordsToInsert.length} records in bulk`)

    // Supabase has a limit of 1000 records per request
    const BATCH_SIZE = 100
    const results: { success: number; errors: any[] } = {
      success: 0,
      errors: []
    }

    // Process in batches
    for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
      batch = recordsToInsert.slice(i, i + BATCH_SIZE).map((record) => ({
        ...record,
        timestamp: new Date().toISOString()
      }))

      const { data, error } = await supabase
        .from("temporary_data")
        .insert(batch)
        .select()

      if (error) {
        results.errors.push({
          error,
          batchIndex: i,
          failedRecords: batch
        })
        DevLog(
          `Batch insert error at index ${i}. Error: ${JSON.stringify(error)}`,
          "warn"
        )
      } else {
        results.success += batch.length
        DevLog(`Successfully inserted batch of ${batch.length} records`)
      }
    }

    // Log final results
    if (results.errors.length > 0) {
      DevLog(
        `Bulk insert completed with errors. Successfully inserted: ${
          results.success
        }/${recordsToInsert.length} records. Errors: ${JSON.stringify(
          results.errors
        )}`,
        "warn"
      )
      throw new Error(
        `Failed to insert: ${results.errors.length} errors. ${JSON.stringify(results.errors)}`
      )
    } else {
      DevLog(`Successfully inserted all ${results.success} records in bulk`)
    }
  } catch (error) {
    posthog.capture("bulk_insert_error", {
      error: error.message,
      batch: batch,
      timestamp: new Date().toISOString()
    })
    DevLog(`Critical error during bulk insert: ${error.message}`, "error")
    throw error // Re-throw to be handled by the caller
  }
}

export default handler
