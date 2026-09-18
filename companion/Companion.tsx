import {
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  Cloud,
  Compass,
  Eye,
  LayoutGrid,
  LockKeyhole,
  Moon,
  Pause,
  Pin,
  Search,
  Settings2,
  Sparkles,
  Sun
} from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import type { Feature } from "./archive-contract"
import ArchiveExplore, {
  ContextDiscoveries,
  type ExploreSelection
} from "./ArchiveExplore"
import {
  tweetUrl,
  type ContextResult,
  type Memory,
  type PanelSnapshot,
  type ReadingTweet,
  type Summary
} from "./types"

export type CompanionAPI = {
  request<T>(action: string, body?: Record<string, unknown>): Promise<T>
  activeTab(): Promise<number | undefined>
  openSettings(): void
}
type Tab = "context" | "explore" | "memory" | "attention"
const minutes = (ms: number) =>
  ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)}m`
const date = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })
const blank: PanelSnapshot = {
  account: null,
  preferences: null,
  current: null,
  queued: 0,
  error: null,
  contributes: false
}

function TweetCard({
  tweet,
  source,
  hint
}: {
  tweet: ReadingTweet
  source: "archive" | "private"
  hint?: string
}) {
  const author = tweet.displayName || tweet.username || "Unknown author"
  return (
    <a
      className="tweet-card"
      href={
        source === "archive"
          ? `https://www.community-archive.org/tweets/${tweet.tweetId}`
          : tweetUrl(tweet)
      }
      target="_blank"
      rel="noreferrer">
      <div className="tweet-author">
        <span className={`avatar ${source}`}>
          {author.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{author}</strong>
          {tweet.username && <small>@{tweet.username}</small>}
        </div>
        <ArrowUpRight size={14} />
      </div>
      <p>{tweet.text || "Photo or media post"}</p>
      <div className="card-foot">
        <span>
          {source === "private" ? (
            <LockKeyhole size={11} />
          ) : (
            <BookOpen size={11} />
          )}
          {source === "private" ? "Your memory" : "Public archive"}
        </span>
        {hint && <span>{hint}</span>}
      </div>
    </a>
  )
}

export default function Companion({
  api,
  demo = false
}: {
  api: CompanionAPI
  demo?: boolean
}) {
  const [snapshot, setSnapshot] = useState<PanelSnapshot>(blank)
  const [ready, setReady] = useState(false)
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem("ca-companion-theme") === "light"
        ? "light"
        : "dark"
    } catch {
      return "dark"
    }
  })
  useEffect(() => {
    document.documentElement.dataset.caTheme = theme
    try {
      localStorage.setItem("ca-companion-theme", theme)
    } catch {
      // Appearance still works if browser storage is unavailable.
    }
  }, [theme])
  const [tab, setTab] = useState<Tab>("context")
  const [explore, setExplore] = useState<ExploreSelection | null>(null)
  function openExplore(feature: Feature) {
    scrollPositions.current.explore = 0
    setExplore((previous) => ({ feature, serial: (previous?.serial || 0) + 1 }))
    setTab("explore")
    setMessage("")
  }
  const [settings, setSettings] = useState(false)
  const [pinned, setPinned] = useState<ReadingTweet | null>(null)
  const [context, setContext] = useState<ContextResult | null>(null)
  const [memories, setMemories] = useState<Memory[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [echoQuery, setEchoQuery] = useState<{
    tweetId: string
    value: string
  } | null>(null)
  const [echoDraft, setEchoDraft] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [privateError, setPrivateError] = useState("")
  const [revision, setRevision] = useState(0)
  const mounted = useRef(true)
  const accountId = snapshot.account?.id
  const historyUnavailable =
    !!accountId && !!snapshot.error && !snapshot.preferences
  const body = useRef<HTMLElement>(null)
  const scrollPositions = useRef<Record<Tab, number>>({
    context: 0,
    explore: 0,
    memory: 0,
    attention: 0
  })
  useLayoutEffect(() => {
    if (!settings && body.current)
      body.current.scrollTop = scrollPositions.current[tab]
  }, [tab, settings, explore?.serial])
  const current = pinned || snapshot.current
  const notice =
    message ||
    (!historyUnavailable &&
    (settings || tab === "memory" || tab === "attention" || snapshot.queued > 0)
      ? snapshot.error
      : null)

  useEffect(() => {
    let live = true
    let inFlight = false
    mounted.current = true
    const refresh = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const result = await api.request<PanelSnapshot>("snapshot", {
          tabId: await api.activeTab()
        })
        if (live) {
          setSnapshot(result)
          setReady(true)
        }
      } catch {
        if (live) {
          setMessage(
            "The companion could not connect. Reload the extension and try again."
          )
          setReady(true)
        }
      } finally {
        inFlight = false
      }
    }
    void refresh()
    const timer = setInterval(refresh, 3000)
    return () => {
      live = false
      mounted.current = false
      clearInterval(timer)
    }
  }, [api, revision])

  useEffect(() => {
    setPinned(null)
    setMemories([])
    setSummary(null)
    setContext(null)
    setMessage("")
    setPrivateError("")
  }, [accountId])

  useEffect(() => {
    let live = true
    setLoading(true)
    setContext(null)
    setMemories([])
    setSummary(null)
    setPrivateError("")
    const timer = setTimeout(
      async () => {
        try {
          if (settings) return
          if (tab === "context" && current) {
            const result = await api.request<ContextResult>("context", {
              tweet: current,
              query:
                echoQuery?.tweetId === current.tweetId
                  ? echoQuery.value
                  : undefined
            })
            if (live) {
              setContext(result)
              setEchoDraft(result.query)
            }
          } else if (tab === "memory" && accountId && !historyUnavailable) {
            const result = await api.request<Memory[]>("memory", { query })
            if (live) setMemories(result)
          } else if (tab === "attention" && accountId && !historyUnavailable) {
            const result = await api.request<Summary>("summary")
            if (live) setSummary(result)
          }
        } catch (error) {
          if (live)
            (tab === "memory" || tab === "attention"
              ? setPrivateError
              : setMessage)(
              error instanceof Error
                ? error.message
                : "Could not load this view."
            )
        } finally {
          if (live) setLoading(false)
        }
      },
      tab === "context" ? 650 : 250
    )
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [
    api,
    tab,
    query,
    current?.tweetId,
    accountId,
    settings,
    revision,
    echoQuery,
    historyUnavailable
  ])

  async function act(action: string, body?: Record<string, unknown>) {
    setBusy(true)
    setMessage("")
    try {
      const result = await api.request<unknown>(action, { ...body, accountId })
      if (!mounted.current) return
      if (action === "export") {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(result, null, 2)], {
            type: "application/json"
          })
        )
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = "community-archive-private-history.json"
        anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setMessage(
          "History exported. Saving is paused; resume when you’re ready."
        )
      } else if (action === "clear")
        setMessage("Private history deleted. Saving is paused.")
      setRevision((value) => value + 1)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong. Try again."
      )
    } finally {
      setBusy(false)
    }
  }

  const accountPrompt = (
    <div className="empty">
      <LockKeyhole size={24} />
      <h2>A memory of your own.</h2>
      <p>
        Sign in to Community Archive to keep a private, searchable record of the
        tweets you see.
      </p>
      <button className="primary" onClick={api.openSettings}>
        Connect your account <ArrowUpRight size={14} />
      </button>
    </div>
  )
  const historyProblem = (
    <div className="empty" role="status">
      <LockKeyhole size={24} />
      <h2>
        {historyUnavailable
          ? "Private history isn’t available yet."
          : "Your history couldn’t load."}
      </h2>
      <p>
        {historyUnavailable
          ? "Your CA account is connected. Memory and Attention need private history to be available before you can use them."
          : "Your saved history hasn’t changed. Try again in a moment."}
      </p>
      <button
        className="secondary"
        onClick={() => setRevision((value) => value + 1)}>
        Try again
      </button>
    </div>
  )

  return (
    <div className="companion">
      {demo && (
        <div className="demo-ribbon">INTERACTIVE PREVIEW · SAMPLE DATA</div>
      )}
      <header className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div className="brand-copy">
          <strong>Community Archive</strong>
          <span>A companion for your curiosity</span>
        </div>
        <div className="brand-actions">
          <button
            className="icon-button"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label={settings ? "Close controls" : "Open controls"}
            onClick={() => setSettings(!settings)}>
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      {settings && (
        <main className="panel-body controls">
          <button className="back" onClick={() => setSettings(false)}>
            <ChevronLeft size={14} /> Back to browsing
          </button>
          <span className="eyebrow">YOUR ARCHIVE, YOUR CHOICE</span>
          <h1>
            Make yourself
            <br />
            at home.
          </h1>
          <section className="control-card">
            <div className="section-title">
              <LockKeyhole size={16} />
              <h2>Private reading history</h2>
            </div>
            <p>
              Save tweet text, authors, seen times and time on screen to your
              Community Archive account.
            </p>
            <p className="muted">
              Only your account can access this history through the app. CA
              operates the database; this is not end-to-end encryption. A small
              offline buffer stays on this device until sync.
            </p>
            {historyUnavailable && (
              <p role="status">
                Private history isn’t available yet. Your account is connected,
                and the public archive tools are ready to use.
              </p>
            )}
            <button
              className={
                snapshot.preferences?.enabled ? "secondary" : "primary"
              }
              disabled={
                busy ||
                !accountId ||
                (!!snapshot.error && !snapshot.preferences)
              }
              onClick={() =>
                act("configure", { enabled: !snapshot.preferences?.enabled })
              }>
              {snapshot.preferences?.enabled ? (
                <>
                  <Pause size={14} /> Pause saving
                </>
              ) : (
                <>Enable private history</>
              )}
            </button>
            {!accountId && (
              <button className="text-button" onClick={api.openSettings}>
                Connect your account first ↗
              </button>
            )}
          </section>
          <section className="control-card">
            <div className="section-title">
              <BookOpen size={16} />
              <h2>Give back to the archive</h2>
            </div>
            <p>
              The existing stream collector contributes tweets to the CA
              firehose, where archive consent rules apply. Private-history
              records and viewing duration stay separate.
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                act("contribute", { enabled: !snapshot.contributes })
              }>
              {snapshot.contributes
                ? "Pause firehose contribution"
                : "Enable firehose contribution"}
            </button>
            <span className="setting-state">
              Currently {snapshot.contributes ? "on" : "off"}
            </span>
          </section>
          <section className="control-card">
            <h2>Your data goes with you.</h2>
            <p>
              History stays until you delete it. Export pauses saving across
              your account for a consistent download.
            </p>
            <div className="button-row">
              <button
                className="secondary"
                disabled={busy || !accountId || historyUnavailable}
                onClick={() => act("export")}>
                Pause & export
              </button>
              <button
                className="danger"
                disabled={busy || !accountId || historyUnavailable}
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete all private reading history from your account and this device’s pending buffer? Saving will be paused on all devices. This cannot be undone."
                    )
                  )
                    void act("clear")
                }}>
                Delete history
              </button>
            </div>
          </section>
          <button className="text-button" onClick={api.openSettings}>
            Account & extension settings <ArrowUpRight size={13} />
          </button>
        </main>
      )}
      <div className="browsing" hidden={settings}>
        <nav className="tabs" aria-label="Companion views">
          {(
            [
              ["context", Compass, "Context"],
              ["explore", LayoutGrid, "Explore"],
              ["memory", BookOpen, "Memory"],
              ["attention", Eye, "Attention"]
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => {
                setTab(key)
                setMessage("")
              }}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
        <main
          className="panel-body"
          ref={body}
          onScroll={(event) => {
            if (!settings)
              scrollPositions.current[tab] = event.currentTarget.scrollTop
          }}>
          {tab === "context" && (
            <>
              <div className="intro">
                <span className="eyebrow">FOLLOW THE THREAD</span>
                <h1>
                  A little more
                  <br />
                  <em>context.</em>
                </h1>
                <p>Old ideas. Familiar voices. New connections.</p>
              </div>
              {current ? (
                <>
                  <section className="current-card">
                    <div className="current-label">
                      <span>
                        <span className="live-dot" />
                        {pinned ? "PINNED TWEET" : "IN VIEW NOW"}
                      </span>
                      <button
                        className={`icon-button ${pinned ? "selected" : ""}`}
                        onClick={() => setPinned(pinned ? null : current)}
                        aria-label={
                          pinned ? "Follow visible tweets" : "Pin this tweet"
                        }>
                        <Pin size={14} />
                      </button>
                    </div>
                    <strong>@{current.username}</strong>
                    <p>{current.text || "Photo or media post"}</p>
                    <a
                      href={tweetUrl(current)}
                      target="_blank"
                      rel="noreferrer">
                      Open tweet <ArrowUpRight size={12} />
                    </a>
                  </section>
                  <div className="section-title spaced">
                    <Sparkles size={16} />
                    <h2>Echoes in the archive</h2>
                  </div>
                  <p className="section-caption">
                    {context?.query ? (
                      <>
                        Archive posts matching <b>{context.query}</b>.
                      </>
                    ) : (
                      "Connections from the public Community Archive."
                    )}
                  </p>
                  <form
                    className="search"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (current && echoDraft.trim())
                        setEchoQuery({
                          tweetId: current.tweetId,
                          value: echoDraft.trim()
                        })
                    }}>
                    <Search size={14} />
                    <input
                      aria-label="Echoes search terms"
                      maxLength={120}
                      value={echoDraft}
                      placeholder="Choose the ideas to connect"
                      onChange={(e) => setEchoDraft(e.target.value)}
                    />
                    <button
                      className="text-button"
                      disabled={loading || !echoDraft.trim()}>
                      Find
                    </button>
                  </form>
                  {loading ? (
                    <div className="loading" role="status">
                      Finding a little context…
                    </div>
                  ) : context?.archive.length ? (
                    context.archive.map((t) => (
                      <TweetCard key={t.tweetId} tweet={t} source="archive" />
                    ))
                  ) : (
                    <p className="quiet-state">
                      {context?.archiveError ||
                        "No archive matches yet. Some tweets don’t have an earlier thread to pull."}
                    </p>
                  )}
                  <div className="section-title spaced">
                    <LockKeyhole size={15} />
                    <h2>You’ve crossed paths before</h2>
                  </div>
                  <p className="section-caption">
                    Earlier posts from this author or with similar words, in
                    your private history.
                  </p>
                  {!accountId ? (
                    <button className="connect-card" onClick={api.openSettings}>
                      Connect your account to find familiar ideas{" "}
                      <ArrowUpRight size={14} />
                    </button>
                  ) : historyUnavailable ? (
                    <p className="quiet-state">
                      Your account is connected. Private history isn’t available
                      yet.
                    </p>
                  ) : context?.privateError ? (
                    <p className="quiet-state">{context.privateError}</p>
                  ) : context?.memories.length ? (
                    context.memories.map((t) => (
                      <TweetCard
                        key={t.tweetId}
                        tweet={t}
                        source="private"
                        hint={`Seen ${date(t.lastSeen)}`}
                      />
                    ))
                  ) : (
                    <p className="quiet-state">
                      {snapshot.preferences?.enabled
                        ? "Your memory will grow as you browse."
                        : "Enable private history in controls to build your memory."}
                    </p>
                  )}
                </>
              ) : (
                <div className="empty context-empty">
                  <Compass size={27} />
                  <h2>Something will catch your eye.</h2>
                  <p>
                    Browse Twitter with this panel open. The tweet in view
                    becomes your starting point. Pin it to explore without
                    losing your place.
                  </p>
                </div>
              )}
              {current && (
                <ContextDiscoveries
                  api={api}
                  current={current}
                  onExplore={openExplore}
                />
              )}
            </>
          )}
          <div hidden={tab !== "explore"}>
            <ArchiveExplore
              key={`${accountId || "guest"}:${explore?.serial || 0}`}
              api={api}
              current={current}
              selection={explore}
            />
          </div>
          {tab === "memory" && (
            <>
              <div className="intro">
                <span className="eyebrow">THAT TWEET YOU SAW</span>
                <h1>
                  Find your
                  <br />
                  <em>way back.</em>
                </h1>
                <p>Your private reading history, across devices.</p>
              </div>
              {!accountId ? (
                accountPrompt
              ) : historyUnavailable || privateError ? (
                historyProblem
              ) : (
                <>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search private history"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="An idea, a phrase, or @someone"
                      maxLength={200}
                    />
                  </label>
                  <div className="list-caption">
                    <span>{query ? "MATCHING MEMORIES" : "RECENTLY SEEN"}</span>
                    <span>
                      <LockKeyhole size={10} /> Only you
                    </span>
                  </div>
                  {loading ? (
                    <p className="loading" role="status">
                      Looking through your memory…
                    </p>
                  ) : memories.length ? (
                    memories.map((t) => (
                      <TweetCard
                        key={t.tweetId}
                        tweet={t}
                        source="private"
                        hint={`${date(t.lastSeen)} · ${minutes(t.visibleMs)} last visit`}
                      />
                    ))
                  ) : (
                    <div className="empty">
                      <BookOpen size={26} />
                      <h2>
                        {query
                          ? "No match this time."
                          : "Your first page is waiting."}
                      </h2>
                      <p>
                        {query
                          ? "Try a different word or the author’s exact handle."
                          : "Enable private history, then browse. Tweets that stay at least half visible for 1.5 seconds will appear here."}
                      </p>
                      {!query && !snapshot.preferences?.enabled && (
                        <button
                          className="primary"
                          onClick={() => setSettings(true)}>
                          Open history controls
                        </button>
                      )}
                    </div>
                  )}
                  <p className="fine-print">
                    Showing up to 40 recent matches. Search reaches all your
                    saved history.
                  </p>
                </>
              )}
            </>
          )}
          {tab === "attention" && (
            <>
              <div className="intro">
                <span className="eyebrow">A MOMENT TO REFLECT</span>
                <h1>
                  Where your
                  <br />
                  <em>attention goes.</em>
                </h1>
                <p>A small mirror for your last seven days.</p>
              </div>
              {!accountId ? (
                accountPrompt
              ) : historyUnavailable || privateError ? (
                historyProblem
              ) : loading ? (
                <p className="loading" role="status">
                  Gathering your week…
                </p>
              ) : (
                summary && (
                  <>
                    <div className="metrics">
                      <div>
                        <strong>{summary.tweets.toLocaleString()}</strong>
                        <span>different tweets seen</span>
                      </div>
                      <div>
                        <strong>{minutes(summary.visibleMs)}</strong>
                        <span>time on screen</span>
                      </div>
                    </div>
                    <section className="week">
                      <div className="section-title">
                        <Eye size={15} />
                        <h2>A week of noticing</h2>
                      </div>
                      <div className="day-bars">
                        {Array.from({ length: 7 }, (_, i) => {
                          const day = new Date()
                          day.setUTCDate(day.getUTCDate() - 6 + i)
                          const key = day.toISOString().slice(0, 10)
                          const item = summary.days.find((d) => d.day === key)
                          const max = Math.max(
                            1,
                            ...summary.days.map((d) => d.visibleMs)
                          )
                          return (
                            <div
                              key={key}
                              title={`${key}: ${item?.tweets || 0} tweets, ${minutes(item?.visibleMs || 0)}`}>
                              <span
                                style={{
                                  height: `${Math.max(3, ((item?.visibleMs || 0) / max) * 70)}px`
                                }}
                              />
                              <small>
                                {day.toLocaleDateString(undefined, {
                                  weekday: "narrow",
                                  timeZone: "UTC"
                                })}
                              </small>
                            </div>
                          )
                        })}
                      </div>
                      <small className="muted">Daily totals in UTC</small>
                    </section>
                    <div className="section-title spaced">
                      <h2>Voices you lingered with</h2>
                    </div>
                    {summary.authors.length ? (
                      summary.authors.map((author, i) => (
                        <div className="author-row" key={author.username}>
                          <span className="rank">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <strong>@{author.username}</strong>
                            <small>{author.tweets} tweets seen</small>
                            <span
                              className="author-bar"
                              style={{
                                width: `${Math.max(5, (author.visibleMs / Math.max(1, summary.authors[0].visibleMs)) * 100)}%`
                              }}
                            />
                          </div>
                          <span>{minutes(author.visibleMs)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="quiet-state">
                        Your first week starts with the next tweet.
                      </p>
                    )}
                    <div className="reflection">
                      <span aria-hidden="true">✳</span>
                      <p>
                        Which of these voices would you like to spend more time
                        with?
                      </p>
                    </div>
                    <p className="fine-print">
                      Time visible is a rough signal, not proof of reading or
                      agreement. Overlapping tweets each count their time.
                      Background tabs and time after 60 seconds of inactivity
                      don’t count.
                    </p>
                  </>
                )
              )}
            </>
          )}
        </main>
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <footer className="status-bar">
        <span
          title={
            snapshot.account
              ? `Connected as ${snapshot.account.label}`
              : undefined
          }>
          <Cloud size={13} />
          {!ready
            ? "Connecting…"
            : !accountId
              ? "Account not connected"
              : snapshot.queued
                ? `${snapshot.queued} waiting to sync`
                : !snapshot.preferences
                  ? "Account connected"
                  : snapshot.preferences.enabled
                    ? "Private history on"
                    : "Private history paused"}
        </span>
        <button
          disabled={busy}
          onClick={() =>
            snapshot.queued ? act("sync") : setSettings(!settings)
          }>
          {snapshot.queued ? "Sync now" : "Controls"}
        </button>
      </footer>
    </div>
  )
}
