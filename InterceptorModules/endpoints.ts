import type { Interceptor } from "./types/General";
import type { Tweet } from "./types/tweet";
import type { TimelineInstructions } from "./types";
import { extractTimelineTweet } from "~utils/twe_utils";
import { extractDataFromResponse } from "~utils/twe_utils";
import { db } from "~database";
import { DevLog } from "~utils/devUtils";


  
  // https://twitter.com/i/api/graphql/lVf2NuhLoYVrpN4nO7uw0Q/FavoriteTweet
  // https://twitter.com/i/api/graphql/lVf2NuhLoYVrpN4nO7uw0Q/UnfavoriteTweet
  export const EndpointsInterceptor: Interceptor =  (req, res) => {
    if (!req.url.includes('/graphql/') && !req.url.includes('/api/')) {
      return;
    }

    let endpoint;
    if (req.url.includes('/graphql/')) {
      const url = new URL(req.url);
      const pathParts = url.pathname.split('/');
      endpoint = pathParts[pathParts.length - 1];
    } else {
      endpoint = req.url;
    }
    try {
    //  const newData = extractDataFromResponse<FavoriteTweetResponse, Tweet>(
    //    res,
    //    (json) => json.data.favorite_tweet,
    //    (entry) => extractTimelineTweet(entry.content.itemContent),
    //  );
  //
//
    const data = {endpoint: endpoint, request: req.body, response: res.response }
    //  // Dispatch a custom event
    //for(const tweet of newData) {
    //  DevLog("Sending intercepted data to IndexDB:", tweet.rest_id)
      const randomId = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}`;
      window.dispatchEvent(new CustomEvent('dataInterceptedEvent', { detail: {data:data, type: "endpoint", originator_id: randomId, item_id: randomId }}));
    //}
    //  DevLog('TTT Likes: ', JSON.stringify(newData, null, 2))
      

      // Add captured data to the database.
      //db.extAddTweets("likes", newData);
      //DevLog("Likes added from interceptor");
      
      DevLog(`TTT Endpoints: 1 item received`);
    } catch (err) {
      DevLog("EndpointsInterceptor failed", err)
      //logger.debug(req.method, req.url, res.status, res.responseText);
      //logger.errorWithBanner('Likes: Failed to parse API response', err as Error);
    }
  };