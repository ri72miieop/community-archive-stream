// Browser regression harness. Bundle with:
// bun build tests/reading-dom.browser.ts --target browser --format cjs
// Evaluate the bundle with a local module/exports object in an isolated blank
// browser tab, then call module.exports.verifyReadingDOM().
import { readVisibleTweets } from "../companion/dom"

export function verifyReadingDOM() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:700px;height:700px;border:0"
  document.body.append(frame)
  const win = frame.contentWindow!
  const doc = frame.contentDocument!
  const checks: string[] = []
  const subject = "/reader/status/123"
  const quote =
    '<div role="link"><a href="/quoted/status/999"><time>Then</time></a><div dir="auto" class="whitespace-pre-wrap">Quoted text</div><div data-testid="tweetText">Quoted text</div></div>'
  const publicPost = (
    handle = "reader",
    id = "123",
    body = "Visible main text"
  ) =>
    `<article><a href="/${handle}">${handle}</a><a href="/${handle}">@${handle}</a>${quote}<div dir="auto" class="whitespace-pre-wrap">${body}</div><a href="/${handle}/status/${id}">Mar 17, 2023</a></article>`
  const read = (html: string, path = subject) => {
    doc.body.innerHTML = `<style>body{margin:80px 0 0}article{width:500px;min-height:160px}</style><main>${html}</main>`
    return readVisibleTweets(doc, {
      location: new URL(`https://x.com${path}`),
      innerHeight: win.innerHeight,
      innerWidth: win.innerWidth,
      getComputedStyle: win.getComputedStyle.bind(win)
    })
  }
  const check = (name: string, valid: boolean) => {
    if (!valid) throw new Error(name)
    checks.push(name)
  }
  try {
    const publicResult = read(publicPost() + publicPost("reply", "456"))
    check(
      "signed-out main post keeps its identity and text",
      publicResult.length === 1 &&
        publicResult[0].tweet.tweetId === "123" &&
        publicResult[0].tweet.text === "Visible main text"
    )
    check(
      "a route mismatch is not attributed to the visible author",
      read(publicPost("someone", "456")).length === 0
    )
    check(
      "a quoted permalink is not mistaken for the page post",
      read(
        publicPost("reply", "456").replace(
          quote,
          quote.replaceAll("quoted/status/999", "reader/status/123")
        )
      ).length === 0
    )
    check(
      "signed-out fallback does not guess timeline identities",
      read(publicPost(), "/home").length === 0
    )
    check(
      "private routes remain excluded",
      read(publicPost(), "/messages/123").length === 0
    )
    check(
      "hidden articles are not observed",
      read(
        publicPost().replace("<article>", '<article style="visibility:hidden">')
      ).length === 0
    )
    check(
      "quote-only text is not saved as the main text",
      read(
        publicPost().replace(
          '<div dir="auto" class="whitespace-pre-wrap">Visible main text</div>',
          ""
        )
      ).length === 0
    )
    const standard = read(
      `<article data-testid="tweet"><div data-testid="User-Name">Reader</div>${quote}<a href="${subject}"><time>Now</time></a><div data-testid="tweetText">Original main text</div></article>`,
      "/home"
    )
    check(
      "signed-in layout still uses the parent timestamp and text",
      standard.length === 1 &&
        standard[0].tweet.tweetId === "123" &&
        standard[0].tweet.text === "Original main text"
    )
    return checks
  } finally {
    frame.remove()
  }
}
