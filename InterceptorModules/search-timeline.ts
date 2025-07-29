import { extractDataFromResponse, extractTimelineTweet, extractTimelineUser, isTimelineEntryListSearch, isTimelineEntrySearchGrid, isTimelineEntryTweet, isTimelineEntryUser } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";
import type { ItemContentUnion, List, TimelineAddEntriesInstruction, TimelineAddToModuleInstruction, TimelineInstructions, TimelineTweet, TimelineTwitterList, Tweet, User } from "./types";
import { DevLog } from "~utils/devUtils";


interface SearchTimelineResponse {
  data: {
    search_by_raw_query: {
      search_timeline: {
        timeline: {
          instructions: TimelineInstructions;
          responseObjects: unknown;
        };
      };
    };
  };
}

// https://twitter.com/i/api/graphql/uPv755D929tshj6KsxkSZg/HomeTimeline
// https://twitter.com/i/api/graphql/70b_oNkcK9IEN13WNZv8xA/HomeLatestTimeline
export const SearchTimelineInterceptor: Interceptor = (req, res) => {
  if (!/\/graphql\/.+\/SearchTimeline/.test(req.url)) {
    return;
  }

  try {
    window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:res.responseText, type: "api_search-timeline", timestamp: new Date().toISOString() }}));

    
  } catch (err) {
    DevLog('TTT SearchTimeline: Failed to parse API response', err)
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('HomeTimeline: Failed to parse API response', err as Error);
  }
};
