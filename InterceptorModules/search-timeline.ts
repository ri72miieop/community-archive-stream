import { extractDataFromResponse, extractTimelineTweet, extractTimelineUser, isTimelineEntryListSearch, isTimelineEntrySearchGrid, isTimelineEntryTweet, isTimelineEntryUser } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";
import type { ItemContentUnion, List, TimelineAddEntriesInstruction, TimelineAddToModuleInstruction, TimelineInstructions, TimelineTweet, TimelineTwitterList, Tweet, User } from "./types";
import { DevLog, saveDebugDataIfDev } from "~utils/devUtils";


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
    saveDebugDataIfDev('search-timeline', res.responseText);
    const json: SearchTimelineResponse = JSON.parse(res.responseText);
    const instructions = json.data.search_by_raw_query.search_timeline.timeline.instructions;

    // Parse tweets in search results.
    // Currently, only "Top", "Latest" and "Media" are supported. "People" and "Lists" are ignored.
    const newTweets: Tweet[] = [];
    //const newUsers: User[] = [];
    //const newLists: List[] = [];

    // The most complicated part starts here.
    //
    // For "Top" and "Latest", the "TimelineAddEntries" instruction contains normal tweets.
    // For "People", the "TimelineAddEntries" instruction contains normal users.
    // For "Media", the "TimelineAddEntries" instruction initializes "search-grid" module.
    // For "Lists", the "TimelineAddToModule" instruction initializes "list-search" module.
    const timelineAddEntriesInstruction = instructions.find(
      (i) => i.type === 'TimelineAddEntries',
    ) as TimelineAddEntriesInstruction<ItemContentUnion>;

    // There will be two requests for "Media" and "Lists" search results.
    // The "TimelineAddToModule" instruction then prepends items to existing module.
    const timelineAddToModuleInstruction = instructions.find(
      (i) => i.type === 'TimelineAddToModule',
    ) as TimelineAddToModuleInstruction<ItemContentUnion>;

    // The "TimelineAddEntries" instruction may not exist in some cases.
    const timelineAddEntriesInstructionEntries = timelineAddEntriesInstruction?.entries ?? [];

    // First, parse "TimelineAddEntries" instruction.
    for (const entry of timelineAddEntriesInstructionEntries) {
      // Extract normal tweets.
      if (isTimelineEntryTweet(entry)) {
        const tweet = extractTimelineTweet(entry.content.itemContent);
        if (tweet) {
          newTweets.push(tweet);
        }
      }

      // Extract media tweets.
      if (isTimelineEntrySearchGrid(entry)) {
        const tweetsInSearchGrid = entry.content.items
          .map((i) => extractTimelineTweet(i.item.itemContent))
          .filter((t): t is Tweet => !!t);

        newTweets.push(...tweetsInSearchGrid);
      }

      //// Extract users.
      //if (isTimelineEntryUser(entry)) {
      //  const user = extractTimelineUser(entry.content.itemContent);
      //  if (user) {
      //    newUsers.push(user);
      //  }
      //}

      //// Extract lists.
      //if (isTimelineEntryListSearch(entry)) {
      //  const lists = entry.content.items.map((i) => i.item.itemContent.list);
      //  newLists.push(...lists);
      //}
    }

    // Second, parse "TimelineAddToModule" instruction.
    if (timelineAddToModuleInstruction) {
      const items = timelineAddToModuleInstruction.moduleItems.map((i) => i.item.itemContent);

      const tweets = items
        .filter((i): i is TimelineTweet => i.__typename === 'TimelineTweet')
        .map((t) => extractTimelineTweet(t))
        .filter((t): t is Tweet => !!t);

      newTweets.push(...tweets);

      //const lists = items
      //  .filter((i): i is TimelineTwitterList => i.__typename === 'TimelineTwitterList')
      //  .map((i) => i.list);
//
      //newLists.push(...lists);
    }
    DevLog("Interceptor.function - SearchTimelineInterceptor: ", newTweets.length)
    
    // Dispatch a custom event
    for(const tweet of newTweets) {
      DevLog("Sending intercepted data to IndexDB:", tweet.rest_id)
      window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:tweet, type: "search-timeline", originator_id: tweet.rest_id, item_id: tweet.rest_id }}));
    }
    DevLog('TTT SearchTimeline: ', JSON.stringify(newTweets, null, 2))
    DevLog(`TTT SearchTimeline: ${newTweets.length} items received`);
  } catch (err) {
    DevLog('TTT SearchTimeline: Failed to parse API response', err)
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('HomeTimeline: Failed to parse API response', err as Error);
  }
};
