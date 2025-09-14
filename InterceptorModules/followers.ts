import type { User } from "./types";

import { extractDataFromResponse, extractTimelineUser } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";
import type { TimelineInstructions } from "./types";
import { DevLog } from "~utils/devUtils";


interface FollowersResponse {
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

// https://twitter.com/i/api/graphql/rRXFSG5vR6drKr5M37YOTw/Followers
// https://twitter.com/i/api/graphql/kXi37EbqWokFUNypPHhQDQ/BlueVerifiedFollowers
export const FollowersInterceptor: Interceptor = (req, res) => {
  if (!/\/graphql\/.+\/(BlueVerified)*Followers/.test(req.url)) {
    return;
  }

  try {
    // Dispatch a custom event
    window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:res.responseText, type: "followers" }}));
    
  } catch (err) {
    DevLog('TTT Followers: Failed to parse API response', err)
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('Followers: Failed to parse API response', err as Error);
  }
};