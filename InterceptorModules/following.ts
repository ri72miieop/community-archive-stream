import { extractDataFromResponse, extractTimelineUser } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";
import type { TimelineInstructions, User } from "./types";
import { DevLog, saveDebugDataIfDev } from "~utils/devUtils";

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

    saveDebugDataIfDev('following', res.responseText);
    const newData = extractDataFromResponse<FollowingResponse, User>(
      res,
      (json) => json.data.user.result.timeline.timeline.instructions,
      (entry) => extractTimelineUser(entry.content.itemContent),
    );

    // Add captured data to the database.
    //db.extAddUsers(ext.name, newData);

    // Dispatch a custom event
    for(const user of newData) {
      DevLog("Sending intercepted data to IndexDB:", user.rest_id)
      window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:user, type: "following", originator_id: user.rest_id }}));
    }
    DevLog('TTT Following: ', JSON.stringify(newData, null, 2))
    DevLog(`TTT Following: ${newData.length} items received`);
  } catch (err) {
    DevLog('TTT Following: Failed to parse API response', err)
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('Following: Failed to parse API response', err as Error);
  }
};