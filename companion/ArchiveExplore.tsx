import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  Flame,
  Network,
  Newspaper,
  RefreshCw,
  Search,
  TrendingUp
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { caUrl, mediaUrl } from "./archive-client"
import {
  archiveHref,
  type ArchiveInput,
  type ArchiveResult,
  type ArchiveTweet,
  type Feature,
  type GraphData,
  type TrendData
} from "./archive-contract"
import type { CompanionAPI } from "./Companion"
import { contextQuery, keywords, type ReadingTweet } from "./types"

export const archiveTools = [
  {
    id: "bangers",
    label: "Bangers",
    icon: Flame,
    description: "Writing worth finding again"
  },
  {
    id: "digest",
    label: "Digest",
    icon: Newspaper,
    description: "The stories behind the conversation"
  },
  {
    id: "trends",
    label: "Trends",
    icon: TrendingUp,
    description: "Ideas rising and returning"
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
    description: "Pull on a word, a phrase, a person"
  },
  {
    id: "graph",
    label: "Graph",
    icon: Network,
    description: "Follow the connections between people"
  }
] as const
export type ExploreSelection = { feature: Feature; serial: number }
const count = (n: number) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(n)
const when = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        ...(/^\d{4}-\d{2}-\d{2}$/.test(value) ? { timeZone: "UTC" } : {})
      })
    : ""

function seed(feature: Feature, current: ReadingTweet | null): ArchiveInput {
  const term = current ? contextQuery(current.text) : ""
  return {
    feature,
    ...(feature === "graph" ? { graphWindow: "recent" as const } : {}),
    q:
      feature === "graph" || feature === "bangers" || feature === "trends"
        ? ""
        : term,
    username:
      feature === "search" || feature === "trends"
        ? ""
        : current?.username || "",
    period: "week",
    granularity: "month",
    offset: 0
  }
}
export function OpenCA({
  href,
  children = "Open in CA"
}: {
  href: string
  children?: React.ReactNode
}) {
  return (
    <a className="open-ca" href={caUrl(href)} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={12} />
    </a>
  )
}
export function ArchiveTweetCard({ tweet }: { tweet: ArchiveTweet }) {
  return (
    <article className="tweet-card archive-result">
      <div className="tweet-author">
        <span className="avatar">
          {(tweet.name || tweet.username).slice(0, 1)}
        </span>
        <div>
          <strong>{tweet.name || tweet.username}</strong>
          <small>
            @{tweet.username} · {when(tweet.createdAt)}
          </small>
        </div>
        <OpenCA href={`/tweets/${tweet.id}`}>
          <span className="sr-only">Open tweet</span>
        </OpenCA>
      </div>
      <p>{tweet.text || "Photo or media post"}</p>
      {tweet.text.length > 450 && (
        <details className="full-tweet">
          <summary>Read full post</summary>
          <p>{tweet.text}</p>
        </details>
      )}
      {!!tweet.media?.length && (
        <div className="archive-media">
          {tweet.media.slice(0, 4).map((m, i) => {
            const url = mediaUrl(m.url)
            return url && m.type === "photo" ? (
              <a key={i} href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt={`Attached image ${i + 1}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </a>
            ) : (
              <OpenCA key={i} href={`/tweets/${tweet.id}`}>
                View {m.type || "media"}
              </OpenCA>
            )
          })}
        </div>
      )}
      {tweet.quotedTweet && (
        <div className="archive-quote">
          <small>
            {tweet.quotedTweet.isDeleted
              ? "Quoted post unavailable"
              : `Quoted · @${tweet.quotedTweet.username}`}
          </small>
          <p>{tweet.quotedTweet.text}</p>
          <OpenCA href={`/tweets/${tweet.quotedTweet.id}`}>
            Open quoted post{tweet.quotedTweet.media.length ? " & media" : ""}
          </OpenCA>
        </div>
      )}
      <div className="card-foot">
        <span>Public archive</span>
        <span>
          {count(tweet.likes)} likes
          {tweet.quoteCount !== undefined
            ? ` · ${count(tweet.quoteCount)} quotes`
            : ""}
        </span>
      </div>
    </article>
  )
}

function TrendChart({ data }: { data: TrendData }) {
  const [index, setIndex] = useState<number | null>(null)
  const [raw, setRaw] = useState(false)
  const values = raw ? data.counts : data.per100k
  const selected =
    index !== null && index < values.length ? index : values.length - 1
  const max = Math.max(1, ...values)
  const x = (i: number) => 12 + (i * 276) / Math.max(1, values.length - 1)
  const y = (n: number) => 105 - (n / max) * 82
  const points = values.map((n, i) => `${x(i)},${y(n)}`).join(" ")
  if (!values.length)
    return (
      <p className="quiet-state">
        No covered time buckets are available for this term.
      </p>
    )
  return (
    <section className="trend-card">
      <div className="section-title">
        <h2>{data.term}</h2>
        <button className="text-toggle" onClick={() => setRaw(!raw)}>
          {raw ? "Show per 100k" : "Show post counts"}
        </button>
      </div>
      <strong className="trend-value">
        {count(values[selected])}
        <small>{raw ? "posts" : "per 100k posts"}</small>
      </strong>
      <span className="trend-bucket">{data.buckets[selected]}</span>
      <svg
        viewBox="0 0 300 125"
        role="img"
        aria-label={`${data.term}, ${raw ? "post counts" : "posts per 100,000"}, ${data.buckets[0]} to ${data.buckets.at(-1)}`}>
        <line x1="12" y1="105" x2="288" y2="105" stroke="var(--border)" />
        <polygon
          points={`12,105 ${points} ${x(values.length - 1)},105`}
          fill="var(--chart-fill)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="var(--chart-accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle
          cx={x(selected)}
          cy={y(values[selected])}
          r="4"
          fill="var(--brand-deep)"
        />
      </svg>
      <input
        className="trend-slider"
        type="range"
        aria-label="Inspect trend date"
        min="0"
        max={values.length - 1}
        value={selected}
        onChange={(e) => setIndex(Number(e.target.value))}
      />
      <div className="chart-labels">
        <span>{data.buckets[0]}</span>
        <span>{data.buckets.at(-1)}</span>
      </div>
      <p className="fine-print">
        Archive observations · updated {when(data.computedAt)}
      </p>
    </section>
  )
}

function GraphView({
  data,
  onPerson
}: {
  data: GraphData
  onPerson: (username: string) => void
}) {
  if (!data.focus)
    return (
      <p className="quiet-state">
        {data.days
          ? "No public community reply history is available for this person in the last year."
          : "This person is not present in the current graph snapshot. Try another archived author."}
      </p>
    )
  const nodes = data.neighbors.slice(0, 6).map((n, i, all) => ({
    ...n,
    x: 150 + Math.cos((i * 2 * Math.PI) / all.length - Math.PI / 2) * 104,
    y: 110 + Math.sin((i * 2 * Math.PI) / all.length - Math.PI / 2) * 79
  }))
  return (
    <>
      <p className="section-caption">{data.timeWindow}</p>
      <section className="graph-card">
        <svg
          viewBox="0 0 300 225"
          role="img"
          aria-label={`Recorded interactions around ${data.focus.username}`}>
          {nodes.map((n) => (
            <line
              key={`line-${n.id}`}
              x1="150"
              y1="110"
              x2={n.x}
              y2={n.y}
              stroke="var(--brand-border)"
              strokeWidth="1.5"
            />
          ))}
          <circle cx="150" cy="110" r="28" fill="var(--brand-deep)" />
          <text
            x="150"
            y="115"
            textAnchor="middle"
            fill="var(--brand-foreground)"
            fontSize="19"
            fontFamily="var(--font-serif)">
            {data.focus.name.slice(0, 1)}
          </text>
          <text
            x="150"
            y="154"
            textAnchor="middle"
            fill="var(--foreground)"
            fontSize="10">
            @{data.focus.username}
          </text>
          {nodes.map((n) => (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`Explore @${n.username}`}
              onClick={() => onPerson(n.username)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onPerson(n.username)
                }
              }}>
              <circle
                cx={n.x}
                cy={n.y}
                r="18"
                fill="var(--brand-soft)"
                stroke="var(--brand-border)"
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fill="var(--brand-deep)"
                fontSize="13">
                {n.name.slice(0, 1)}
              </text>
              <title>@{n.username}</title>
            </g>
          ))}
        </svg>
        <p className="section-caption">
          Select a person to explore their connections.
        </p>
      </section>
      {data.neighbors.map((n) => (
        <button
          className="graph-person"
          key={n.id}
          onClick={() => onPerson(n.username)}>
          <span className="avatar">{n.name.slice(0, 1)}</span>
          <span>
            <strong>{n.name}</strong>
            <small>
              @{n.username} · {count(n.interactions)}{" "}
              {data.days
                ? n.interactions === 1
                  ? "reply"
                  : "replies"
                : n.interactions === 1
                  ? "interaction"
                  : "interactions"}
            </small>
            {n.lastInteractionAt && (
              <small>Latest reply · {when(n.lastInteractionAt)}</small>
            )}
          </span>
          <ChevronRight size={14} />
        </button>
      ))}
      {!data.neighbors.length && (
        <p className="quiet-state">
          {data.days
            ? "No replies to archived community members were found in this period."
            : "No retained connections for this person in this snapshot."}
        </p>
      )}
      <p className="fine-print">
        Snapshot {when(data.generatedAt)} · {data.timeWindow}
        {data.truncated ? " · More connections available." : ""}
      </p>
    </>
  )
}

function Results({
  result,
  onPerson,
  onTerm
}: {
  result: ArchiveResult
  onTerm: (term: string) => void
  onPerson: (username: string) => void
}) {
  switch (result.feature) {
    case "search":
    case "bangers":
      return (
        <>
          {result.data.tweets.map((t) => (
            <ArchiveTweetCard key={t.id} tweet={t} />
          ))}
          {!result.data.tweets.length && (
            <p className="quiet-state">
              No matches in this part of the archive. Try a different person,
              phrase, or time period.
            </p>
          )}
        </>
      )
    case "trends":
      if (result.data.words)
        return (
          <section className="trending-words">
            <h2>Trending words</h2>
            <p className="section-caption">
              This week in the archive
              {result.data.words[0]?.since && result.data.words[0]?.until && (
                <>
                  {" "}
                  · {when(result.data.words[0].since)} –{" "}
                  {when(result.data.words[0].until)}
                </>
              )}
            </p>
            {result.data.words.map((word) => (
              <button
                className="graph-person"
                key={word.term}
                onClick={() => onTerm(word.term)}>
                <span>
                  <strong>{word.term}</strong>
                  <small>
                    {word.lane === "falling" ||
                    (word.changePct !== null && word.changePct < 0)
                      ? "Cooling"
                      : word.lane === "emerging"
                        ? "Emerging"
                        : word.changePct === 0
                          ? "Steady"
                          : "Rising"}
                    {word.changePct !== null
                      ? ` · ${word.changePct > 0 ? "+" : ""}${Math.round(word.changePct)}%`
                      : ""}
                    {` · ${count(word.posts)} posts`}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
            {!result.data.words.length && (
              <p className="quiet-state">
                No trending words available for this week.
              </p>
            )}
          </section>
        )
      return (
        <>
          <TrendChart
            key={`${result.data.term}:${result.data.granularity}`}
            data={result.data}
          />
          <h2 className="spaced">Recent examples</h2>
          {result.data.evidence.map((t) => (
            <ArchiveTweetCard key={t.id} tweet={t} />
          ))}
        </>
      )
    case "graph":
      return <GraphView data={result.data} onPerson={onPerson} />
    case "digest":
      return (
        <>
          {result.data.date ? (
            <>
              <div className="edition-label">
                {result.data.preview ? "SAMPLE EDITION" : "PUBLISHED EDITION"} ·{" "}
                {when(result.data.date)}
              </div>
              <p className="digest-lede">{result.data.summary[0]}</p>
              {result.data.stories.map((story) => (
                <article className="digest-story" key={story.slug}>
                  <span className="eyebrow">
                    {story.category}
                    {story.relevant ? " · CONNECTED TO YOUR CONTEXT" : ""}
                  </span>
                  <h2>{story.title}</h2>
                  <p>{story.subtitle}</p>
                  <details>
                    <summary>Read the story & sources</summary>
                    <ul>
                      {story.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                    {story.tweets.map((t) => (
                      <ArchiveTweetCard key={t.id} tweet={t} />
                    ))}
                  </details>
                  <OpenCA href={story.href}>Full story & conversation</OpenCA>
                </article>
              ))}
            </>
          ) : (
            <p className="quiet-state">
              No published digest for this date. Choose another day or the
              latest edition.
            </p>
          )}
        </>
      )
  }
}

export default function ArchiveExplore({
  api,
  current,
  selection
}: {
  api: CompanionAPI
  current: ReadingTweet | null
  selection: ExploreSelection | null
}) {
  const [input, setInput] = useState<ArchiveInput | null>(() =>
    selection ? seed(selection.feature, current) : null
  )
  const [draft, setDraft] = useState<ArchiveInput | null>(input)
  const [result, setResult] = useState<ArchiveResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [graphTrail, setGraphTrail] = useState<ArchiveInput[]>([])
  const workspaces = useRef<
    Partial<
      Record<
        Feature,
        {
          input: ArchiveInput
          draft: ArchiveInput | null
          graphTrail: ArchiveInput[]
        }
      >
    >
  >({})
  const request = useRef(0)
  const signature = JSON.stringify(input)
  useEffect(() => {
    const id = ++request.current
    setError("")
    setResult(null)
    if (
      !input ||
      (input.feature === "search" && !input.q) ||
      (input.feature === "graph" && !input.username)
    ) {
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .request<ArchiveResult>("archive", { input })
      .then((value) => {
        if (id === request.current) setResult(value)
      })
      .catch((e) => {
        if (id === request.current)
          setError(e.message || "Could not load this view.")
      })
      .finally(() => {
        if (id === request.current) setLoading(false)
      })
    return () => {
      request.current++
    }
  }, [api, signature, revision])
  function remember() {
    if (input) workspaces.current[input.feature] = { input, draft, graphTrail }
  }
  function choose(feature: Feature, reset = false) {
    if (feature === input?.feature && !reset) return
    remember()
    const saved = reset ? undefined : workspaces.current[feature]
    const value = saved?.input || seed(feature, current)
    setInput(value)
    setDraft(saved?.draft || value)
    setGraphTrail(saved?.graphTrail || [])
  }
  function person(username: string) {
    if (input?.username === username) return
    if (input?.username) setGraphTrail((trail) => [...trail.slice(-19), input])
    const value: ArchiveInput = {
      feature: "graph",
      username,
      graphWindow: "recent"
    }
    setInput(value)
    setDraft(value)
  }
  async function more() {
    if (
      !input ||
      !result ||
      (result.feature !== "search" && result.feature !== "bangers") ||
      result.data.nextOffset === null
    )
      return
    const id = ++request.current
    setLoading(true)
    setError("")
    try {
      const next = await api.request<ArchiveResult>("archive", {
        input: { ...input, offset: result.data.nextOffset }
      })
      if (
        id === request.current &&
        (next.feature === "search" || next.feature === "bangers")
      )
        setResult({
          ...next,
          data: {
            ...next.data,
            tweets: [
              ...new Map(
                [...result.data.tweets, ...next.data.tweets].map((t) => [
                  t.id,
                  t
                ])
              ).values()
            ]
          }
        })
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : "Could not load more.")
    } finally {
      if (id === request.current) setLoading(false)
    }
  }
  const tool = archiveTools.find((t) => t.id === input?.feature)
  return (
    <div className="archive-explore">
      {!input ? (
        <>
          <div className="intro">
            <span className="eyebrow">THE WHOLE ARCHIVE, WITH YOU</span>
            <h1>
              Follow your
              <br />
              <em>curiosity.</em>
            </h1>
            <p>Five ways into the same community.</p>
          </div>
          <div className="tool-menu">
            {archiveTools.map((t) => (
              <button key={t.id} onClick={() => choose(t.id)}>
                <t.icon size={21} />
                <span>
                  <strong>{t.label}</strong>
                  <small>{t.description}</small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          {current && (
            <p className="section-caption">
              Start from @{current.username}’s tweet, or take your own
              direction.
            </p>
          )}
          <div className="website-tools">
            <span className="eyebrow">MORE ON COMMUNITY ARCHIVE</span>
            <OpenCA href="/stream">Live stream</OpenCA>
            <OpenCA href="/conversation-map">Conversation map</OpenCA>
            <OpenCA href="/strands">Conversation strands</OpenCA>
            <OpenCA href="/bulletin">Opportunities bulletin</OpenCA>
            <OpenCA href="/user-dir">People & profiles</OpenCA>
            <OpenCA href="/community">Community apps</OpenCA>
            <OpenCA href="/settings">Account & archive settings</OpenCA>
          </div>
        </>
      ) : (
        <>
          <button
            className="back"
            onClick={() => {
              remember()
              setInput(null)
              setDraft(null)
            }}>
            <ArrowLeft size={13} /> All archive tools
          </button>
          <div className="explore-heading">
            <div>
              <span className="eyebrow">EXPLORE THE ARCHIVE</span>
              <h1>{tool?.label}</h1>
            </div>
            {tool && <tool.icon size={27} />}
          </div>
          <div className="tool-switcher" aria-label="Archive tools">
            {archiveTools.map((t) => (
              <button
                key={t.id}
                aria-pressed={t.id === input.feature}
                onClick={() => choose(t.id)}
                title={t.description}>
                {t.label}
              </button>
            ))}
          </div>
          <form
            className="archive-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft) {
                if (draft.feature === "graph") setGraphTrail([])
                setInput({ ...draft, offset: 0 })
                setRevision((v) => v + 1)
              }
            }}>
            {input.feature === "bangers" && (
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={!!input.username}
                  disabled={!current}
                  onClick={() => {
                    const v = seed("bangers", current)
                    setInput(v)
                    setDraft(v)
                  }}>
                  This author
                </button>
                <button
                  type="button"
                  aria-pressed={!input.username}
                  onClick={() => {
                    const v: ArchiveInput = {
                      feature: "bangers",
                      period: "week"
                    }
                    setInput(v)
                    setDraft(v)
                  }}>
                  Community
                </button>
              </div>
            )}
            {input.feature === "graph" ||
            (input.feature === "bangers" && !!input.username) ? (
              <label className="search">
                <span>@</span>
                <input
                  aria-label="Archive author"
                  placeholder="A Twitter username"
                  maxLength={15}
                  value={draft?.username || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft!,
                      username: e.target.value.replace(/^@/, "")
                    })
                  }
                />
                <button className="icon-button" aria-label="Explore author">
                  <ChevronRight size={16} />
                </button>
              </label>
            ) : (
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="Archive topic"
                  placeholder={
                    input.feature === "digest"
                      ? "Find a story in this edition"
                      : "An idea or phrase"
                  }
                  maxLength={input.feature === "trends" ? 80 : 120}
                  value={draft?.q || ""}
                  onChange={(e) => setDraft({ ...draft!, q: e.target.value })}
                />
                <button className="icon-button" aria-label="Search archive">
                  <ChevronRight size={16} />
                </button>
              </label>
            )}
            <div className="archive-filters">
              {input.feature === "bangers" && !input.username && (
                <label>
                  Period{" "}
                  <select
                    aria-label="Bangers period"
                    value={input.period || "week"}
                    onChange={(e) => {
                      const v = {
                        ...input,
                        offset: 0,
                        period: e.target.value as ArchiveInput["period"]
                      }
                      setInput(v)
                      setDraft(v)
                    }}>
                    <option value="week">This week</option>
                    <option value="today">Today</option>
                    <option value="three-months">Three months</option>
                    <option value="all">All time</option>
                  </select>
                </label>
              )}
              {input.feature === "trends" && input.q && (
                <label>
                  Interval{" "}
                  <select
                    aria-label="Trend interval"
                    value={input.granularity || "month"}
                    onChange={(e) => {
                      const v = {
                        ...input,
                        granularity: e.target
                          .value as ArchiveInput["granularity"]
                      }
                      setInput(v)
                      setDraft(v)
                    }}>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </label>
              )}
              {input.feature === "digest" && (
                <label>
                  Edition{" "}
                  <input
                    type="date"
                    aria-label="Digest date"
                    value={input.date || ""}
                    onChange={(e) => {
                      const v = { ...input, date: e.target.value || undefined }
                      setInput(v)
                      setDraft(v)
                    }}
                  />
                </label>
              )}
              {input.feature === "search" && current && (
                <label className="author-filter">
                  <input
                    type="checkbox"
                    checked={!!input.username}
                    onChange={(e) => {
                      const v = {
                        ...input,
                        offset: 0,
                        username: e.target.checked ? current.username : ""
                      }
                      setInput(v)
                      setDraft(v)
                    }}
                  />{" "}
                  @{input.username || current.username} only
                </label>
              )}
              {current && input.feature !== "trends" && (
                <button
                  className="text-toggle"
                  type="button"
                  onClick={() => choose(input.feature, true)}>
                  Use current tweet
                </button>
              )}
            </div>
          </form>
          {input.feature === "graph" && graphTrail.length > 0 && (
            <button
              className="back graph-back"
              onClick={() => {
                const previous = graphTrail[graphTrail.length - 1]
                setGraphTrail((trail) => trail.slice(0, -1))
                setInput(previous)
                setDraft(previous)
              }}>
              <ArrowLeft size={13} /> Back to @{graphTrail.at(-1)?.username}
            </button>
          )}
          {result && <p className="section-caption">{result.explanation}</p>}
          {error && (
            <div className="feature-error" role="status">
              <p>{error}</p>
              {error.includes("Sign in") && (
                <button className="primary" onClick={api.openSettings}>
                  Connect CA account
                </button>
              )}
              <button
                className="text-toggle"
                onClick={() => setRevision((v) => v + 1)}>
                <RefreshCw size={11} /> Try again
              </button>
            </div>
          )}
          {loading && (
            <p className="loading" role="status">
              Opening this part of the archive…
            </p>
          )}
          {input.feature === "trends" && input.q && (
            <button className="back" onClick={() => choose("trends", true)}>
              <ArrowLeft size={13} /> Trending words
            </button>
          )}
          {result && (
            <Results
              result={result}
              onPerson={person}
              onTerm={(term) => {
                const value: ArchiveInput = {
                  feature: "trends",
                  q: term,
                  granularity: "month"
                }
                setInput(value)
                setDraft(value)
              }}
            />
          )}
          {!result && !loading && !error && (
            <p className="quiet-state">
              Enter {input.feature === "graph" ? "a person" : "a topic"} above
              to begin.
            </p>
          )}
          {result &&
            (result.feature === "bangers" || result.feature === "search") &&
            result.data.nextOffset !== null &&
            result.data.nextOffset <= 1000 && (
              <button
                className="secondary load-more"
                disabled={loading}
                onClick={more}>
                Show more posts
              </button>
            )}
          <div className="explore-footer">
            <OpenCA href={result?.href || archiveHref(input)}>
              Continue exploring on CA
            </OpenCA>
          </div>
        </>
      )}
    </div>
  )
}

export function ContextDiscoveries({
  api,
  current,
  onExplore
}: {
  api: CompanionAPI
  current: ReadingTweet
  onExplore: (feature: Feature) => void
}) {
  const [bangers, setBangers] = useState<ArchiveResult<"bangers"> | null>(null)
  const [digest, setDigest] = useState<ArchiveResult<"digest"> | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const lastLoad = useRef(0)
  const term = keywords(current.text)[0] || ""
  useEffect(() => {
    let active = true
    setBangers(null)
    setDigest(null)
    setUnavailable(false)
    const timer = setTimeout(
      async () => {
        lastLoad.current = Date.now()
        const results = await Promise.allSettled([
          api.request<ArchiveResult<"bangers">>("archive", {
            input: { feature: "bangers", username: current.username }
          }),
          api.request<ArchiveResult<"digest">>("archive", {
            input: { feature: "digest", q: term, username: current.username }
          })
        ])
        if (!active) return
        if (results[0].status === "fulfilled") setBangers(results[0].value)
        if (results[1].status === "fulfilled") setDigest(results[1].value)
        setUnavailable(results.some((r) => r.status === "rejected"))
      },
      Math.max(1200, 12000 - (Date.now() - lastLoad.current))
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [api, current.username, term])
  const earlier = bangers?.data.tweets.find((t) => t.id !== current.tweetId)
  const story = digest?.data.stories.find((s) => s.relevant)
  return (
    <section className="context-discoveries">
      <div className="section-title spaced">
        <Flame size={15} />
        <h2>A few more ways in</h2>
      </div>
      {earlier && (
        <button className="discovery-card" onClick={() => onExplore("bangers")}>
          <span className="eyebrow">EARLIER FROM @{current.username}</span>
          <p>{earlier.text}</p>
          <span className="discovery-foot">
            Explore their bangers <ChevronRight size={12} />
          </span>
        </button>
      )}
      {story && (
        <button className="discovery-card" onClick={() => onExplore("digest")}>
          <span className="eyebrow">IN THE PUBLISHED DIGEST</span>
          <h3>{story.title}</h3>
          <p>{story.subtitle}</p>
          <span className="discovery-foot">
            Read the story <ChevronRight size={12} />
          </span>
        </button>
      )}
      <div className="context-tools">
        {archiveTools.map((t) => (
          <button key={t.id} onClick={() => onExplore(t.id)}>
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>
      {unavailable && (
        <p className="section-caption">
          Some archive context is unavailable. You can still choose a tool to
          explore.
        </p>
      )}
    </section>
  )
}
