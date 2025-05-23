import type { Interceptor } from "./types/General";
import type { Tweet } from "./types/tweet";
import type { TimelineInstructions } from "./types";
import { extractTimelineTweet } from "~utils/twe_utils";
import { extractDataFromResponse } from "~utils/twe_utils";
import { db } from "~database";
import { DevLog, saveDebugDataIfDev } from "~utils/devUtils";

export interface LikesResponse {
    data: {
      user: {
        result: {
          timeline_v2: {
            timeline: {
              instructions: TimelineInstructions;
              responseObjects: unknown;
            };
          };
          __typename: 'User';
        };
      };
    };
  }
  
  // https://twitter.com/i/api/graphql/lVf2NuhLoYVrpN4nO7uw0Q/Likes
  export const LikesInterceptor: Interceptor =  (req, res) => {
    if (!/\/graphql\/.+\/Likes/.test(req.url)) {
      return;
    }

    try {
      saveDebugDataIfDev('likes', res.responseText);  
      const newData = extractDataFromResponse<LikesResponse, Tweet>(
        res,
        (json) => json.data.user.result.timeline_v2.timeline.instructions,
        (entry) => extractTimelineTweet(entry.content.itemContent),
      );
  

      // Dispatch a custom event
    for(const tweet of newData) {
      DevLog("Sending intercepted data to IndexDB:", tweet.rest_id)
      window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:tweet, type: "likes", originator_id: tweet.rest_id, item_id: tweet.rest_id }}));
    }
      DevLog('TTT Likes: ', JSON.stringify(newData, null, 2))
      

      // Add captured data to the database.
      //db.extAddTweets("likes", newData);
      //DevLog("Likes added from interceptor");
      
      DevLog(`TTT Likes: ${newData.length} items received`);
    } catch (err) {
      DevLog("LikesInterceptor failed", err)
      //logger.debug(req.method, req.url, res.status, res.responseText);
      //logger.errorWithBanner('Likes: Failed to parse API response', err as Error);
    }
  };