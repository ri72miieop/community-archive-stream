import { isTimelineEntryTweet, extractTimelineTweet, isTimelineEntryConversationThread } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";
import type { TimelineInstructions, Tweet, TimelineAddEntriesInstruction, TimelineTweet, TimelineAddToModuleInstruction } from "./types";
import { DevLog, saveDebugDataIfDev } from "~utils/devUtils";


interface TweetDetailResponse {
  data: {
    threaded_conversation_with_injections_v2: {
      instructions: TimelineInstructions;
    };
  };
}

// https://twitter.com/i/api/graphql/8sK2MBRZY9z-fgmdNpR3LA/TweetDetail
export const TweetDetailInterceptor: Interceptor = (req, res) => {
  if (!/\/graphql\/.+\/TweetDetail/.test(req.url)) {
    return;
  }

  try {
    

    const eventObject = { detail: {data:res.responseText, type: "api_tweet-detail", timestamp: new Date().toISOString() }}
    DevLog("Sending intercepted data to IndexDB:", eventObject)
    window.dispatchEvent(new CustomEvent('dataInterceptedEvent', eventObject));


    // Add captured tweets to the database.
    //db.extAddTweets(ext.name, newData);
    //DevLog('TTT TweetDetail: ', JSON.stringify(newData, null, 2))
    
  } catch (err) {
    
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('TweetDetail: Failed to parse API response', err as Error);
  }
};