import { extractDataFromResponse, extractTimelineTweet, isTimelineEntryConversationThread, isTimelineEntryHomeConversationThread, isTimelineEntryTweet } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";
import type { TimelineAddEntriesInstruction, TimelineInstructions, TimelineTweet, Tweet } from "./types";
import { DevLog, isDev } from "~utils/devUtils";

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

    window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:res.responseText, type: "api_home-timeline", timestamp: new Date().toISOString() }}));
    DevLog('TTT HomeTimeline: ', JSON.stringify(res.responseText, null, 2))
    DevLog(`TTT HomeTimeline: 1 items received`);
  } catch (err) {
    DevLog('TTT HomeTimeline: Failed to parse API response', err)
  }
};
