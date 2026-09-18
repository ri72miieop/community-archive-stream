import type { ReadingTweet } from "./types"
import { isReadingPage } from "./types"
import type { Candidate } from "./visibility"

// X's signed-out status page has no tweet test IDs or <time> elements.
// Only accept its leading article when its own author and permalink agree with
// the page URL. Do not infer identities for replies or quoted cards in this layout.
function publicStatusTweet(
  article: HTMLElement,
  status: RegExpMatchArray
): ReadingTweet | null {
  const own = (node: Element) =>
    node.closest("article") === article &&
    !node.closest('a [dir="auto"], [role="link"], blockquote')
  const links = Array.from(
    article.querySelectorAll<HTMLAnchorElement>("a[href]")
  ).filter(own)
  const author = links.find((link) =>
    /^\/\w{1,15}$/.test(link.getAttribute("href") || "")
  )
  const permalink = links.find((link) =>
    /\/status\/\d+/.test(link.getAttribute("href") || "")
  )
  const expectedAuthor = `/${status[1]}`
  const expectedPost = `${expectedAuthor}/status/${status[2]}`
  if (
    author?.getAttribute("href")?.toLowerCase() !==
      expectedAuthor.toLowerCase() ||
    permalink?.getAttribute("href") !== expectedPost
  )
    return null
  const text = Array.from(
    article.querySelectorAll<HTMLElement>('div[dir="auto"].whitespace-pre-wrap')
  ).find((node) => own(node) && !node.closest("a"))?.innerText
  if (!text?.trim()) return null
  const name = links
    .find(
      (link) =>
        link.getAttribute("href")?.toLowerCase() ===
          expectedAuthor.toLowerCase() &&
        link.innerText.trim() &&
        !link.innerText.trim().startsWith("@")
    )
    ?.innerText.trim()
  return {
    tweetId: status[2],
    username: status[1],
    displayName: (name || status[1]).slice(0, 100),
    text: text.slice(0, 30000),
    pageKind: "thread"
  }
}

type ReadingViewport = Pick<
  Window,
  "innerHeight" | "innerWidth" | "getComputedStyle"
> & { location: Pick<Location, "href" | "pathname"> }

export function readVisibleTweets(
  doc = document,
  win: ReadingViewport = window
): Candidate[] {
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
  const articles = Array.from(
    doc.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
  )
  const status = path.match(/^\/(\w{1,15})\/status\/(\d{1,25})\/?$/)
  const publicArticle = status
    ? doc.querySelector<HTMLElement>("main article")
    : null
  if (publicArticle && !publicArticle.hasAttribute("data-testid"))
    articles.push(publicArticle)
  return articles.flatMap((article) => {
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
    let tweet: ReadingTweet | null
    if (!article.hasAttribute("data-testid")) {
      tweet = publicStatusTweet(article, status!)
      if (!tweet) return []
    } else {
      // Use the author's timestamp, not the last status link (which may be a quote).
      const timestamp = Array.from(article.querySelectorAll("time")).find(
        (time) =>
          time.closest("article") === article &&
          !time.closest('[role="link"]:not(a)')
      )
      const href = timestamp?.closest("a")?.getAttribute("href")
      const match = href?.match(/^\/(\w{1,15})\/status\/(\d{1,25})(?:\?|$|\/)/)
      if (!match) return []
      const textNode = Array.from(
        article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]')
      ).find(
        (node) =>
          node.closest("article") === article &&
          !node.closest('[role="link"]:not(a)')
      )
      const author = article.querySelector<HTMLElement>(
        '[data-testid="User-Name"]'
      )
      tweet = {
        tweetId: match[2],
        username: match[1],
        displayName: (author?.innerText.split("\n")[0] || match[1]).slice(
          0,
          100
        ),
        text: (textNode?.innerText || "").slice(0, 30000),
        pageKind
      }
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
