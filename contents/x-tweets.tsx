import type {
  PlasmoCSConfig,
  PlasmoCSUIProps,
  PlasmoGetInlineAnchorList,
  PlasmoGetShadowHostId,
  PlasmoMountShadowHost
} from "plasmo"
import { useEffect, useRef, useState } from "react"

import { useStorage } from "@plasmohq/storage/hook"
import { supabase } from "~core/supabase"


import { DevLog, isDev } from "~utils/devUtils"
import { sendToBackground } from "@plasmohq/messaging"

export const getShadowHostId: PlasmoGetShadowHostId = ({ element }) =>
  element.getAttribute("aria-labelledby") + `-xtweets`

//import "~/prod.css"
export const getInlineAnchorList: PlasmoGetInlineAnchorList = async () => {
  const anchors = document.querySelectorAll("article")
  return Array.from(anchors).map((element) => {
    return {
      element,
      insertPosition: "beforeend"
    }
  })
}

export const mountShadowHost: PlasmoMountShadowHost = ({
  shadowHost,
  anchor,
  mountState
}) => {
  const article = anchor.element
  const tweetId = article.getAttribute("aria-labelledby") || "unknown-tweet"
  
  // Add ID to the shadowHost for easy identification
  const hostElement = shadowHost as HTMLElement
  hostElement.id = `tweet-status-${tweetId}`
  
  // Position it as an overlay on the top-right corner of the tweet
  hostElement.setAttribute('style', `
    position: absolute;
    top: 35px;
    right: 8px;
    width: auto;
    height: auto;
    z-index: 1000;
    pointer-events: none;
  `)
  
  // Make the article container position relative so our absolute positioning works
  const articleStyle = article.style
  if (!articleStyle.position || articleStyle.position === 'static') {
    article.style.position = 'relative'
  }
  
  // Insert the shadow host inside the article instead of after it
  article.appendChild(shadowHost)
  
  // Add a CSS class for easy selection
  hostElement.classList.add('plasmo-tweet-status-indicator')
  
  // Clean up event listener when extension is unloaded
  mountState.observer.observe(shadowHost, { childList: true, subtree: true })
}

export const config: PlasmoCSConfig = {
  matches: ["https://*.x.com/*"],
  all_frames: true
}




function GetTweetId(tweetElement: Element): string | null {

  try{
    const tweetLinks = tweetElement.querySelectorAll('a[href*="/status/"]');
    const tweetLink = tweetLinks[tweetLinks.length - 1]?.getAttribute('href') || '';
    const tweetId = tweetLink.split('/status/')[1]?.split(/[^0-9]/)[0] || null;

    return tweetId;
    
  
    } catch (error) {
      console.error('Error scraping tweet:', error, tweetElement.id);
      return null;
    }
  }

const XTweet = ({ anchor }: PlasmoCSUIProps) => {
  const parentElement = anchor.element.parentElement
  const tweetElement = parentElement.querySelector("article")
  const currentTweetId = GetTweetId(tweetElement)
  const currentUrl = window.location.href
  if(!currentTweetId) return null

  const processedTweetIds = useRef(new Set());
  const isNotificationPage = currentUrl.includes("/notifications");

  const [interceptedTweet, setInterceptedTweet] = useState<any>(null)
  const [preferences] = useStorage("tweetEnhancementPreferences")

  
 
  const loadInterceptedTweet = async () => {
    if (!currentTweetId || processedTweetIds.current.has(currentTweetId)) return;
    const MAX_RETRIES = 5;
    let retryCount = 0;
    let response;
    
    while (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, retryCount === 0 ? 1000 : 4000));
      
      response = await sendToBackground({
        name: "get-intercepted-tweet",
        body: {
          originator_id: currentTweetId
        }
      });
      
      if (response.success) {
        setInterceptedTweet(response);
        break;
      }
      
      retryCount++;
      DevLog(`Retry ${retryCount}/${MAX_RETRIES} for tweet ${currentTweetId}`);
    }
    
    if (response?.success && response.date_added) {
      processedTweetIds.current.add(currentTweetId);
    }
    if(retryCount == MAX_RETRIES){
      DevLog("Failed to load intercepted tweet:" + currentTweetId, "warn")
      setInterceptedTweet({
        success: false,
        reason: "Failed to load intercepted tweet"
      })
    }

    
    if(isDev){
    const insertedDate = response.timestamp;
    const processedDate = response.date_added;
    if (!insertedDate && !processedDate) {
      const { error } = await supabase.from("no_show").upsert({tweet_id: currentTweetId})
            if (error) {
              DevLog("Error inserting no_show:" + error, "error")
            }
        }
      }
  }

  // Load intercepted tweet
  useEffect(() => {
    // Only load intercepted tweet if the tweet element is visible in the viewport
    if (tweetElement && currentTweetId) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            loadInterceptedTweet();
            observer.disconnect(); // Only need to load once when it becomes visible
          }
        });
      }, { threshold: 0.1 }); // Trigger when at least 10% of the tweet is visible
      
      observer.observe(tweetElement);
      
      return () => {
        observer.disconnect();
      };
    }
  }, [currentTweetId, tweetElement])


  return (<>
  
    {preferences?.markTweetWithInterceptionStatus && interceptedTweet && !isNotificationPage && (
      <div style={{ 
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        pointerEvents: 'auto',
        cursor: interceptedTweet.canSendToCA && interceptedTweet.timestamp !== null ? 'default' : 'help'
      }}>
        {interceptedTweet.canSendToCA && interceptedTweet.timestamp !== null ? (
          <span style={{ 
            color: '#10b981', 
            fontWeight: 'bold', 
            fontSize: '14px',
            lineHeight: '1'
          }}>✓</span>
        ) : (
          <span 
            style={{ 
              color: '#ef4444', 
              fontWeight: 'bold', 
              fontSize: '14px',
              lineHeight: '1'
            }} 
            title={`${interceptedTweet.reason} - ${interceptedTweet.timestamp} - ${interceptedTweet.date_added}`}
          >
            ✗ 
          </span>
        )}
      </div>
    )}
    </>
  )
}
  

export default XTweet