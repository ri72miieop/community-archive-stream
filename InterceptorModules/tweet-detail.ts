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
    saveDebugDataIfDev('tweet-detail', res.responseText);
    const json: TweetDetailResponse = JSON.parse(res.responseText);
    const instructions = json.data.threaded_conversation_with_injections_v2.instructions;

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
      if (isTimelineEntryConversationThread(entry)) {
        // Be careful about the "conversationthread-{id}-cursor-showmore-{cid}" item.
        const tweetsInConversation = entry.content.items.map((i) => {
          if (i.entryId.includes('-tweet-')) {
            return extractTimelineTweet(i.item.itemContent);
          }
        });

        newData.push(...tweetsInConversation.filter((t): t is Tweet => !!t));
      }
    }

    // Lazy-loaded conversations.
    const timelineAddToModuleInstruction = instructions.find(
      (i) => i.type === 'TimelineAddToModule',
    ) as TimelineAddToModuleInstruction<TimelineTweet>;

    if (timelineAddToModuleInstruction) {
      const tweetsInConversation = timelineAddToModuleInstruction.moduleItems
        .map((i) => extractTimelineTweet(i.item.itemContent))
        .filter((t): t is Tweet => !!t);

      newData.push(...tweetsInConversation);
    }

    // Dispatch a custom event
    for(const tweet of newData) {
      const eventObject = { detail: {data:tweet, type: "tweet-detail", originator_id: tweet.rest_id, item_id: tweet.rest_id }}
      DevLog("Sending intercepted data to IndexDB:", eventObject)
      window.dispatchEvent(new CustomEvent('dataInterceptedEvent', eventObject));
    }
    // Add captured tweets to the database.
    //db.extAddTweets(ext.name, newData);
    //DevLog('TTT TweetDetail: ', JSON.stringify(newData, null, 2))
    DevLog(`TTT TweetDetail: ${newData.length} items received`);
  } catch (err) {
    DevLog('TTT TweetDetail: Failed to parse API response', err)
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('TweetDetail: Failed to parse API response', err as Error);
  }
};