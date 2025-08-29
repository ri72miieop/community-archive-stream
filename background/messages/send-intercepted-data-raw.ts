import type { PlasmoMessaging } from "@plasmohq/messaging"

import { GlobalCachedData } from "~contents/Storage/CachedData"
import { getUser, type UserMinimal } from "~utils/dbUtils"

import { DevLog, PLASMO_PUBLIC_RECORD_EXPIRY_SECONDS } from "~utils/devUtils"
import { indexDB, type TimedObject } from "~utils/IndexDB"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const type = req.body.type
  const user: UserMinimal = await getUser()
  const userIdFromCookies = await getUserId();

  DevLog(
    "Interceptor.background.message - send-intercepted-data-raw: Received intercepted data:",
    req.body
  )

  const userid = user?.id ?? userIdFromCookies ?? "anon";

  DevLog(
    "Interceptor.background.message - send-intercepted-data-raw: Sending intercepted data to IndexDB:",
    req.body.originator_id
  )

  try {
    DevLog(
      "Interceptor.background.message - send-intercepted-data-raw: Sending intercepted data to IndexDB:",
      req.body.originator_id
    )
    console.log("Interceptor.background.data - send-intercepted-data-raw: Sending intercepted data to IndexDB:", req.body.data)
    const result = await canProcessInterceptedData(userid)
    let resObject;
    if (result.success) {
      const redisResult = await sendDataToRedisAPI({type, data: req.body.data, user_id: userid, timestamp: req.body.timestamp})
      DevLog("Interceptor.background.message - send-intercepted-data-raw: result of sending intercepted data to Redis:", redisResult)
      if(redisResult.success) {
        resObject = { success: true }
      } else {
        await indexDB.data.update(req.body.originator_id, {
          canSendToCA: false,
          reason: redisResult.reason
        })
        resObject = { success: false, error: redisResult.reason }
      }
      
      
    } else {
      resObject = { success: false, error: result.reason }
    }
    DevLog("Interceptor.background.message - send-intercepted-data-raw: result of sending intercepted data to IndexDB:", resObject)
    res.send(resObject)

  } catch (error) {
    DevLog(`Error processing ${type}: ${error.message}`, "error")
    res.send({ success: false, error: error.message })
  }
}

async function canProcessInterceptedData(
  userid: string,
): Promise<{success: boolean, reason?: string}> {
  
    
  // Get fresh preference value instead of using cached version
  const canIntercept = await GlobalCachedData.GetCanIntercept(userid);
  const userpreferences = await GlobalCachedData.GetEnhancementPreferences();
  const canSendToCA = userpreferences.interceptData;
  

  if (!canIntercept || !canSendToCA) {
    DevLog("User blocked from intercepting or cannot send to CA")
    DevLog("user preferences: " + JSON.stringify(userpreferences) + " canSendToCA " + canSendToCA + " canIntercept " + canIntercept)
    const errorMsg = canIntercept ? "User has disabled sending data to CA" : "User blocked from sending data to CA";
    //await indexDB.data.update(recordId, {
    //  canSendToCA: false,
    //  reason: errorMsg
    //})
    return {success: false, reason: errorMsg}
  }

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



const FIREHOSE_ENDPOINT_URL = process.env.PLASMO_PUBLIC_FIREHOSE_API_ENDPOINT_URL;
const API_AUTH_TOKEN = process.env.PLASMO_PUBLIC_API_AUTH_TOKEN;


async function sendDataToRedisAPI(interceptedData: {
  type: string;
  data: any;
  user_id?: string; 
  
  timestamp?: number | string; 
}) {

  const apiPayload = {
      type: interceptedData.type,
      data: interceptedData.data,
      user_id: interceptedData.user_id ?? 'anon', 
      ...(interceptedData.timestamp && { timestamp: interceptedData.timestamp }),
  };
  console.log("Interceptor.background.data - send-intercepted-data-raw: Sending intercepted data to firehose:", apiPayload)
  
  // Retry mechanism with exponential backoff
  const maxRetries = 5;
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.pow(3, attempt) * 10000; // 30s, 90s, 270s, 810s
        console.log(`Retrying API call (attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(FIREHOSE_ENDPOINT_URL, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              // Add your chosen Authentication header
              'Authorization': `ApiKey ${API_AUTH_TOKEN}` // Example using an API Key
              // Or 'Authorization': `Bearer ${API_AUTH_TOKEN}` // Example using Bearer Token
          },
          body: JSON.stringify(apiPayload),
      });

      if (response.ok) {
          const responseData = await response.json();

          let processedRecords = responseData.processedRecords;
          for (let item of processedRecords) {
            const record = item.record;
            let canSendToCA = item.success;

            let objectToUpdate = {
              originator_id: record.originator_id,
              canSendToCA: canSendToCA,
              reason: canSendToCA ? undefined : item.reason,
              date_added: record.date_added || new Date().toISOString(),
              data: record.data,
              timestamp: record.timestamp || new Date().toISOString(),
              type: record.type,
              user_id: record.user_id
            }
            await indexDB.data.put(objectToUpdate)
          }

          return responseData;
      } else {
          const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" })); // Catch cases where body isn't JSON
          console.error(`${new Date().toISOString()} API Error (${response.status}) on attempt ${attempt + 1}:`, errorData);
          
          lastError = { success: false, reason: errorData, status: response.status, error: errorData };
      }

    } catch (error: any) {
        console.error(`Network or fetch error sending data to ${FIREHOSE_ENDPOINT_URL} (attempt ${attempt + 1}):`, JSON.stringify(error));
        lastError = { success: false, error: error.message };
    }
  }

  console.error(`Failed to send data after ${maxRetries + 1} attempts. Final error:`, lastError);
  

  return lastError;
}


let cachedUserId = null;

const getUserId = async () => {
  if (cachedUserId !== null) {
    return cachedUserId;
  }

  const userIdCookie = await chrome.cookies.get({url: 'https://x.com',name: 'twid'});
  cachedUserId = userIdCookie ? decodeURIComponent(userIdCookie.value).replace("u=","") : null;
  return cachedUserId;
};

// Listen for cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.name === 'twid' && changeInfo.cookie.domain === '.x.com') {
    if (changeInfo.removed) {
      // Cookie was deleted (user logged out)
      cachedUserId = null;
    } else {
      // Cookie was updated (user logged in/switched accounts)
      cachedUserId = decodeURIComponent(changeInfo.cookie.value).replace("u=","");
    }
  }
});

// Initialize cache on startup
getUserId();


export default handler
