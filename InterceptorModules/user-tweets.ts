import { extractDataFromResponse, extractTimelineUser } from "~utils/twe_utils";
import type { Interceptor } from "./types/General";



//import { db } from '@/core/database';
import type {
  TimelineAddEntriesInstruction,
  TimelineInstructions,
  TimelinePinEntryInstruction,
  TimelineTweet,
  Tweet,
  User
} from './types';
import {
  extractTimelineTweet,
  isTimelineEntryProfileConversation,
  isTimelineEntryTweet,
} from '~utils/twe_utils';
import { DevLog, saveDebugDataIfDev } from '~utils/devUtils';

interface UserTweetsResponse {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: TimelineInstructions;
            metadata: unknown;
          };
        };
        __typename: 'User';
      };
    };
  };
}

// https://twitter.com/i/api/graphql/H8OOoI-5ZE4NxgRr8lfyWg/UserTweets
// https://twitter.com/i/api/graphql/Q6aAvPw7azXZbqXzuqTALA/UserTweetsAndReplies
export const UserTweetsInterceptor: Interceptor = (req, res) => {
  if (!/\/graphql\/.+\/UserTweets/.test(req.url)) {
    return;
  }

  try {

    window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:res.responseText, type: "api_user-tweets", timestamp: new Date().toISOString() }}));
    
  } catch (err) {
    DevLog(req.method, req.url, res.status, res.responseText,"debug")
    //logger.debug(req.method, req.url, res.status, res.responseText);
    //logger.errorWithBanner('UserTweets: Failed to parse API response', err as Error);
  }
};

