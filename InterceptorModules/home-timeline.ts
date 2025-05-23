import { extractDataFromResponse, extractTimelineTweet, isTimelineEntryConversationThread, isTimelineEntryHomeConversationThread, isTimelineEntryTweet } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";
import type { TimelineAddEntriesInstruction, TimelineInstructions, TimelineTweet, Tweet } from "./types";
import { DevLog, isDev, saveDebugDataIfDev } from "~utils/devUtils";

import { supabase } from "~core/supabase";


interface HomeTimelineResponse {
  data: {
    home: {
      home_timeline_urt: {
        instructions: TimelineInstructions;
        metadata: unknown;
        responseObjects: unknown;
      };
    };
  };
}

// https://twitter.com/i/api/graphql/uPv755D929tshj6KsxkSZg/HomeTimeline
// https://twitter.com/i/api/graphql/70b_oNkcK9IEN13WNZv8xA/HomeLatestTimeline
export const HomeTimelineInterceptor: Interceptor = (req, res) => {
  if (!/\/graphql\/.+\/Home(Latest)?Timeline/.test(req.url)) {
    return;
  }

  try {
    // Save debug data to a file if in development mode
    
    saveDebugDataIfDev('home-timeline', res.responseText);

    const json: HomeTimelineResponse = JSON.parse(res.responseText);
    const instructions = json.data.home.home_timeline_urt.instructions;

    const newData: Tweet[] = [];

    const timelineAddEntriesInstruction = instructions.find(
      (i) => i.type === 'TimelineAddEntries',
    ) as TimelineAddEntriesInstruction<TimelineTweet>;

    // When loading more tweets in conversation, the "TimelineAddEntries" instruction may not exist.
    const timelineAddEntriesInstructionEntries = timelineAddEntriesInstruction?.entries ?? [];

    for (const entry of timelineAddEntriesInstructionEntries) {
      // The main tweet.
      if (isTimelineEntryTweet(entry)) {
        const tweet = extractTimelineTweet(entry.content.itemContent);
        if (tweet) {
          newData.push(tweet);
        }
      }

      // The conversation thread.
      if (isTimelineEntryHomeConversationThread(entry)) {
        const tweetsInConversation = entry.content.items.map((i) => {
          if (i.entryId.includes('-tweet-')) {
            return extractTimelineTweet(i.item.itemContent)
          }
        })

        newData.push(...tweetsInConversation.filter((t): t is Tweet => !!t));
      }
    }



    DevLog("Interceptor.function - HomeTimelineInterceptor: ", newData.length)
    
    // Dispatch a custom event
    for(const tweet of newData) {
      DevLog("Sending intercepted data to IndexDB:", tweet.rest_id)
      window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:tweet, type: "home-timeline", originator_id: tweet.rest_id, item_id: tweet.rest_id }}));
    }
    DevLog('TTT HomeTimeline: ', JSON.stringify(newData, null, 2))
    DevLog(`TTT HomeTimeline: ${newData.length} items received`);
  } catch (err) {
    DevLog('TTT HomeTimeline: Failed to parse API response', err)
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('HomeTimeline: Failed to parse API response', err as Error);
  }
};
