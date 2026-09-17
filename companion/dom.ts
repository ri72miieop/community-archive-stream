import type { ReadingTweet } from "./types"
import { isReadingPage } from "./types"
import type { Candidate } from "./visibility"

export function readVisibleTweets(doc = document, win = window): Candidate[] {
  if (!isReadingPage(win.location.href)) return []
  const path = win.location.pathname
  const pageKind: ReadingTweet["pageKind"] = path.includes("/status/")
    ? "thread"
    : path === "/home"
      ? "home"
      : path.startsWith("/search")
        ? "search"
        : /^\/[\w]+\/?$/.test(path)
          ? "profile"
          : "other"
  return Array.from(
    doc.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
  ).flatMap((article) => {
    const rect = article.getBoundingClientRect()
    const height = Math.max(
      0,
      Math.min(rect.bottom, win.innerHeight) - Math.max(rect.top, 60)
    )
    const width = Math.max(
      0,
      Math.min(rect.right, win.innerWidth) - Math.max(rect.left, 0)
    )
    // Very long tweets qualify when half a viewport is visible.
    const ratio =
      (height * width) /
      Math.max(1, Math.min(rect.height, win.innerHeight - 60) * rect.width)
    if (ratio < 0.5 || win.getComputedStyle(article).visibility === "hidden")
      return []
    // Use the author's timestamp, not the last status link (which may be a quote).
    const timestamp =
      Array.from(article.querySelectorAll("time")).find(
        (time) => !time.closest('[role="link"]')
      ) ?? article.querySelector("time")
    const href = timestamp?.closest("a")?.getAttribute("href")
    const match = href?.match(/^\/(\w{1,15})\/status\/(\d{1,25})(?:\?|$|\/)/)
    if (!match) return []
    const textNode = Array.from(
      article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]')
    ).find((node) => !node.closest('[role="link"]'))
    const author = article.querySelector<HTMLElement>(
      '[data-testid="User-Name"]'
    )
    const tweet: ReadingTweet = {
      tweetId: match[2],
      username: match[1],
      displayName: (author?.innerText.split("\n")[0] || match[1]).slice(0, 100),
      text: (textNode?.innerText || "").slice(0, 30000),
      pageKind
    }
    return [
      {
        tweet,
        ratio,
        distance: Math.abs(
          (Math.max(rect.top, 60) + Math.min(rect.bottom, win.innerHeight)) /
            2 -
            win.innerHeight * 0.4
        )
      }
    ]
  })
}
