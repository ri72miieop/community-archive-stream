import { extractDataFromResponse, extractTimelineUser } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";
import type { TimelineInstructions, User } from "./types";
import { DevLog } from "~utils/devUtils";

export interface FollowingResponse {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: TimelineInstructions;
          };
        };
        __typename: 'User';
      };
    };
  };
}

// https://twitter.com/i/api/graphql/iSicc7LrzWGBgDPL0tM_TQ/Following
export const FollowingInterceptor: Interceptor = (req, res) => {
  if (!/\/graphql\/.+\/Following/.test(req.url)) {
    return;
  }

  try {

    // Dispatch a custom event
    window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:res.responseText, type: "following" }}));
  } catch (err) {
    DevLog('TTT Following: Failed to parse API response', err)
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('Following: Failed to parse API response', err as Error);
  }
};