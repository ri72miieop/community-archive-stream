import type { PlasmoMessaging } from "@plasmohq/messaging"

import { GlobalCachedData } from "~contents/Storage/CachedData"
import { getUser, type UserMinimal } from "~utils/dbUtils"

import { DevLog } from "~utils/devUtils"
import { getPersistableFirehoseRecords } from "~utils/firehoseResponse"
import { indexDB } from "~utils/IndexDB"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const type = req.body.type
  const user: UserMinimal = await getUser()
  const userIdFromCookies = await getUserId();

  const userid = user?.id ?? userIdFromCookies ?? "anon";

  try {
    const result = await canProcessInterceptedData(userid)
    let resObject;
    if (result.success) {
      const redisResult = await sendDataToRedisAPI({type, data: req.body.data, user_id: userid, timestamp: req.body.timestamp})
      if(redisResult.success) {
        resObject = redisResult
      } else {
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
    return {success: false, reason: errorMsg}
  }

  return {success: true}
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
          const responseData: unknown = await response.json();
          const persistence = getPersistableFirehoseRecords(responseData)
          if (persistence.records.length > 0) {
            await indexDB.data.bulkPut(persistence.records)
          }

          const acceptedCount = persistence.records.filter(
            (record) => record.status === "accepted"
          ).length
          const rejectedCount = persistence.records.length - acceptedCount
          if (persistence.unsafeResponseCount > 0) {
            DevLog(
              `Firehose response discarded ${persistence.unsafeResponseCount} unsafe payload representation(s)`,
              "warn"
            )
          }

          return {
            success: persistence.unsafeResponseCount === 0 && acceptedCount > 0,
            reason: persistence.unsafeResponseCount > 0
              ? "UNSAFE_FIREHOSE_RESPONSE"
              : acceptedCount === 0
                ? "FIREHOSE_REJECTED"
                : undefined,
            acceptedCount,
            rejectedCount
          };
      } else {
          console.error(`${new Date().toISOString()} Firehose API error (${response.status}) on attempt ${attempt + 1}`);
          const reason = `FIREHOSE_HTTP_${response.status}`
          lastError = { success: false, reason, status: response.status, error: reason };
      }

    } catch (error: any) {
        console.error(`Network or fetch error sending data to firehose (attempt ${attempt + 1})`);
        lastError = { success: false, reason: "FIREHOSE_NETWORK_ERROR", error: "FIREHOSE_NETWORK_ERROR" };
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
