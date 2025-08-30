import type { Interceptor } from "./types/General";
import type { TimelineInstructions } from "./types";
import { DevLog } from "~utils/devUtils";

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
  export const ListTweetsInterceptor: Interceptor =  (req, res) => {
    if (!/\/graphql\/.+\/ListLatestTweetsTimeline/.test(req.url)) {
      return;
    }

    try {
      // Dispatch a custom event
      
      window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:res.responseText, type: "api_list_tweets", timestamp: new Date().toISOString()}}));

    } catch (err) {
      DevLog("LikesInterceptor failed", err)
      //logger.debug(req.method, req.url, res.status, res.responseText);
      //logger.errorWithBanner('Likes: Failed to parse API response', err as Error);
    }
  };