import type { User } from "@supabase/supabase-js";
import { db } from "~database";
import { ExtensionType } from "~InterceptorModules/types/General";
import type { Tweet } from "~InterceptorModules/types";
import { DevLog } from "~utils/devUtils";
import { useLiveQuery } from "~utils/observable";


export function useCaptureCount(extName: string) {
  return useLiveQuery(() => db.extGetCaptureCount(extName), [extName], 0);
}

//export function useCapturedRecords(extName: string, type: ExtensionType) {
//  return useLiveQuery<Tweet[] | User[] | void, Tweet[] | User[] | void>(
//    () => {
//      DevLog('useCapturedRecords liveQuery re-run', extName);
//
//      if (type === ExtensionType.USER) {
//        return db.extGetCapturedUsers(extName);
//      }
//
//      if (type === ExtensionType.TWEET) {
//        return db.extGetCapturedTweets(extName);
//      }
//    },
//    [extName],
//    [],
//  );
//}
//
//export function useClearCaptures(extName: string) {
//  return async () => {
//    DevLog('Clearing captures for extension:', extName);
//    return db.extClearCaptures(extName);
//  };
//}