import type { User } from "./types";

import { extractDataFromResponse, extractTimelineUser } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";
import type { TimelineInstructions } from "./types";
import { DevLog, saveDebugDataIfDev } from "~utils/devUtils";


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
    saveDebugDataIfDev('followers', res.responseText);
    const newData = extractDataFromResponse<FollowersResponse, User>(
      res,
      (json) => json.data.user.result.timeline.timeline.instructions,
      (entry) => extractTimelineUser(entry.content.itemContent),
    );

    // Add captured data to the database.
    //db.extAddUsers(ext.name, newData);
    DevLog('TTT Followers: ', newData)
    // Dispatch a custom event
    for(const user of newData) {
      DevLog("Sending intercepted data to IndexDB:", user.rest_id)
      window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:user, type: "followers", originator_id: user.rest_id }}));
    }
    DevLog('TTT Followers: ', JSON.stringify(newData, null, 2))
    DevLog(`TTT Followers: ${newData.length} items received`);
  } catch (err) {
    DevLog('TTT Followers: Failed to parse API response', err)
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('Followers: Failed to parse API response', err as Error);
  }
};