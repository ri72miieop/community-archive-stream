import type { PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"

import { BookmarksInterceptor } from "~InterceptorModules/Bookmarks"
import { FavoriteTweetInterceptor } from "~InterceptorModules/favoriteTweet"
import { FollowersInterceptor } from "~InterceptorModules/followers"
import { FollowingInterceptor } from "~InterceptorModules/following"
import { HomeTimelineInterceptor } from "~InterceptorModules/home-timeline"
import { LikesInterceptor } from "~InterceptorModules/Likes"
import { TweetDetailInterceptor } from "~InterceptorModules/tweet-detail"
import { UserTweetsInterceptor } from "~InterceptorModules/user-tweets"
import { DevLog, isDev} from "~utils/devUtils"
import { EndpointsInterceptor } from "~InterceptorModules/endpoints"
import { SearchTimelineInterceptor } from "~InterceptorModules/search-timeline"

//inspo: https://github.com/prinsss/twitter-web-exporter/blob/main/src/core/extensions/manager.ts#L59
export const config: PlasmoCSConfig = {
  matches: ["https://*.x.com/*"],
  run_at: "document_start",
  world: "MAIN"
}

// content.ts
const injectInterceptor = () => {
  // Only run if we're in the top window
  const interceptDataKey = "__interceptedData"
  if (window && window.self && window.self === window.top) {
    // Flag to ensure one-time execution
    const xhrInterceptorKey = "__xhrInterceptorInitialized"
    if (!(xhrInterceptorKey in window)) {
      // @ts-ignore
      window[xhrInterceptorKey] = true

      const Interceptors = [
        LikesInterceptor,
        BookmarksInterceptor,
        FollowingInterceptor,
        FollowersInterceptor,
        HomeTimelineInterceptor,
        TweetDetailInterceptor,
        UserTweetsInterceptor,
        FavoriteTweetInterceptor,
        SearchTimelineInterceptor
      ]
      if(isDev) {
        //Interceptors.push(EndpointsInterceptor)
      }
      

      const inter = function (req, res) {
        if (
          req.url.includes("video.twimg.com") //|| req.url.includes("api/1.1") || req.url.includes("api/2") || req.url.includes("x.com/1.1") ||   req.url.includes("i/api/fleets/v1/") || req.url.includes("ExploreSidebar")
        )
          return

        for (const interceptor of Interceptors) {
          interceptor(req, res)
        }
      }

      const xhrOpen = window.XMLHttpRequest.prototype.open
      const xhrSend = window.XMLHttpRequest.prototype.send

      window.XMLHttpRequest.prototype.open = function (method, url) {
        // Store request details on the XHR instance
        this._requestDetails = {
          method,
          url,
          requestBody: null
        }

        this.addEventListener("load", () => {
          const body = this._requestDetails.requestBody;
          delete this._requestDetails;
          inter({ method, url, body: body }, this)
        })

        xhrOpen.apply(this, arguments)
      }

      window.XMLHttpRequest.prototype.send = function (body) {
        if (this._requestDetails) {
          this._requestDetails.requestBody = body
        }
        return xhrSend.apply(this, arguments)
      }
    }
  }
}

// Execute the injection
injectInterceptor()
