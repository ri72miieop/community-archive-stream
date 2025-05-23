import type { Interceptor } from "./types/General";
import type { Tweet } from "./types/tweet";
import type { TimelineInstructions } from "./types";
import { extractTimelineTweet } from "~utils/twe_utils";
import { extractDataFromResponse } from "~utils/twe_utils";
import { db } from "~database";
import { DevLog, saveDebugDataIfDev } from "~utils/devUtils";

export interface FavoriteTweetRequest {
    variables: {
      tweet_id: string,
      query_id: string
    };
  }

export interface FavoriteTweetResponse {
    data: {
      favorite_tweet: string
    };
  }

export interface UnfavoriteTweetResponse {
    data: {
      unfavorite_tweet: string
    };
  }
  
  // https://twitter.com/i/api/graphql/lVf2NuhLoYVrpN4nO7uw0Q/FavoriteTweet
  // https://twitter.com/i/api/graphql/lVf2NuhLoYVrpN4nO7uw0Q/UnfavoriteTweet
  export const FavoriteTweetInterceptor: Interceptor =  (req, res) => {
    if (!/.*\/graphql\/.+\/(Favorite|Unfavorite)Tweet/.test(req.url)) {
      return;
    }

    saveDebugDataIfDev('favoriteTweet', res.responseText);

    const isRemoveFavorite = req.url.toLowerCase().includes("unfavoritetweet");
    const reqBody = JSON.parse(req.body.toString()) as FavoriteTweetRequest;

    const item = isRemoveFavorite? res.response as UnfavoriteTweetResponse : res.response as FavoriteTweetResponse;
    DevLog("REQUEST FAVORITS",JSON.stringify(req.body, null, 2))
    DevLog("FavoriteTweetInterceptor was called")
    DevLog("isRemoveFavorite", isRemoveFavorite)
    DevLog("response",res.response)
    try {
    //  const newData = extractDataFromResponse<FavoriteTweetResponse, Tweet>(
    //    res,
    //    (json) => json.data.favorite_tweet,
    //    (entry) => extractTimelineTweet(entry.content.itemContent),
    //  );
  //
//
    //  // Dispatch a custom event
    //for(const tweet of newData) {
    //  DevLog("Sending intercepted data to IndexDB:", tweet.rest_id)
    //  window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:tweet, type: "likes", originator_id: tweet.rest_id, item_id: tweet.rest_id }}));
    //}
    //  DevLog('TTT Likes: ', JSON.stringify(newData, null, 2))
      

      // Add captured data to the database.
      //db.extAddTweets("likes", newData);
      //DevLog("Likes added from interceptor");
      
      DevLog(`TTT Likes: {newData.length} items received`);
    } catch (err) {
      DevLog("LikesInterceptor failed", err)
      //logger.debug(req.method, req.url, res.status, res.responseText);
      //logger.errorWithBanner('Likes: Failed to parse API response', err as Error);
    }
  };