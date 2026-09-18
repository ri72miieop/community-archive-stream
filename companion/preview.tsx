import { createRoot } from "react-dom/client"

import { previewArchive } from "./archive-fixtures"
import Companion, { type CompanionAPI } from "./Companion"
import {
  previewContext,
  previewMemories,
  previewSnapshot,
  previewSummary,
  previewTweet
} from "./fixtures"
import { contextQuery } from "./types"

import "./companion.css"
import "./preview.css"

let snapshot = structuredClone(previewSnapshot)
let memories = [...previewMemories]
const api: CompanionAPI = {
  async request<T>(action: string, body: Record<string, any> = {}): Promise<T> {
    switch (action) {
      case "archive":
        return (await previewArchive(body.input)) as T
      case "snapshot":
        return { ...snapshot } as T
      case "context":
        return {
          ...previewContext,
          query: body.query || contextQuery(body.tweet.text),
          memories: memories.slice(0, 2)
        } as T
      case "memory":
        return memories.filter((t) =>
          `${t.text} ${t.username}`
            .toLowerCase()
            .includes((body.query || "").toLowerCase().replace(/^@/, ""))
        ) as T
      case "summary":
        return (
          memories.length
            ? previewSummary
            : { tweets: 0, visibleMs: 0, authors: [], days: [] }
        ) as T
      case "configure":
        snapshot.preferences = { enabled: body.enabled, epoch: "preview" }
        break
      case "clear":
        memories = []
        snapshot.preferences = { enabled: false, epoch: "preview" }
        break
      case "contribute":
        snapshot.contributes = body.enabled
        break
      case "export":
        snapshot.preferences = { enabled: false, epoch: "preview" }
        return { sampleData: true, memories } as T
    }
    return undefined as T
  },
  async activeTab() {
    return 1
  },
  openSettings() {
    alert(
      "This preview uses sample data. The installed extension opens your Community Archive sign-in."
    )
  }
}

function Preview() {
  return (
    <div className="preview-layout">
      <aside className="preview-nav">
        <span className="x-logo">𝕏</span>
        <span>Home</span>
        <span>Explore</span>
        <span>Notifications</span>
        <span>Messages</span>
        <span>Bookmarks</span>
        <span>Profile</span>
        <small>
          COMMUNITY ARCHIVE
          <br />
          SIDEBAR CONCEPT / 01
        </small>
      </aside>
      <section className="preview-timeline">
        <header>
          For you <span>Following</span>
        </header>
        <div className="preview-compose">What’s happening?</div>
        <article className="preview-post active">
          <div className="preview-author">
            <span>M</span>
            <strong>
              Mira <small>@mira_builds · 12m</small>
            </strong>
          </div>
          <p>{previewTweet.text}</p>
          <div className="preview-quote">
            The internet remembers everything.
            <br />
            <em>But what helps us remember?</em>
            <span>NOTES ON COLLECTIVE MEMORY</span>
          </div>
          <div className="preview-reactions">♡ 148　 ↻ 24　 ◇ 17</div>
          <button
            onClick={() => {
              snapshot.current =
                snapshot.current?.tweetId === previewTweet.tweetId
                  ? previewMemories[2]
                  : previewTweet
            }}>
            Change the tweet in view →
          </button>
        </article>
        <article className="preview-post">
          <div className="preview-author">
            <span>J</span>
            <strong>
              Jules <small>@jules_notes · 26m</small>
            </strong>
          </div>
          <p>{previewMemories[1].text}</p>
          <div className="preview-reactions">♡ 63　 ↻ 8　 ◇ 4</div>
        </article>
        <p className="preview-caption">
          An interactive design preview with fictional tweets.
          <br />
          Try Explore for Bangers, Digest, Trends, Search, and Graph.
          <br />
          Memory and Attention stay private to your account.
        </p>
      </section>
      <aside className="preview-panel">
        <Companion api={api} demo />
      </aside>
    </div>
  )
}
document.addEventListener("click", (event) => {
  if ((event.target as Element).closest('a[target="_blank"]')) {
    event.preventDefault()
    alert(
      "Sample tweet — links open the original tweet or archive page in the installed extension."
    )
  }
})
createRoot(document.getElementById("root")!).render(<Preview />)
