// Fictional, deterministic preview data. Never used by the installed extension.
import type {
  ArchiveInput,
  ArchiveResult,
  ArchiveTweet
} from "./archive-contract"
import { archiveHref } from "./archive-contract"
import { previewContext, previewMemories, previewTweet } from "./fixtures"

const tweets: ArchiveTweet[] = [
  previewTweet,
  ...previewMemories,
  ...previewContext.archive
].map((t, i) => ({
  id: t.tweetId,
  username: t.username,
  name: t.displayName,
  text: t.text,
  createdAt: `2026-09-${String(15 - i).padStart(2, "0")}T12:00:00Z`,
  likes: 231 - i * 27,
  rts: 26 - i * 3,
  quoteCount: 34 - i * 4
}))
const people = [
  ...new Map(
    tweets.map((t) => [
      t.username,
      { id: t.username, username: t.username, name: t.name }
    ])
  ).values()
]
export async function previewArchive(
  input: ArchiveInput
): Promise<ArchiveResult> {
  await new Promise((resolve) => setTimeout(resolve, 180))
  const base = { version: 1 as const, href: archiveHref(input) }
  const q = (input.q || "").toLowerCase()
  switch (input.feature) {
    case "bangers":
    case "search": {
      const matches = tweets.filter(
        (t) =>
          (!input.username || t.username === input.username) &&
          (input.feature === "bangers" ||
            !q ||
            `${t.text} ${t.username}`.toLowerCase().includes(q))
      )
      const offset = input.offset || 0
      return {
        ...base,
        feature: input.feature,
        data: {
          tweets: matches.slice(offset, offset + 3),
          nextOffset: offset + 3 < matches.length ? offset + 3 : null
        },
        explanation:
          input.feature === "bangers"
            ? input.username
              ? `Earlier writing by @${input.username}. Sample profile ranking.`
              : "Community bangers · ranked by member quotes. Sample data."
            : "Text matches in the sample archive. Try “community”, “memory”, or “conversation”."
      }
    }
    case "digest":
      return {
        ...base,
        feature: "digest",
        data: {
          date: input.date || "2026-09-16",
          preview: true,
          matched: !!q,
          summary: [
            "A community starts asking what it means to remember together."
          ],
          stories: [
            {
              slug: "shared-memory",
              title: "From another feed to a shared memory",
              subtitle:
                "A handful of builders are looking for ways to keep the context around ideas, not just the posts.",
              category: "Culture",
              bullets: [
                "Mira asks what communities could build if shared memory became the goal.",
                "Leah points to the missing links between preserved stories.",
                "The open question: how do we leave useful paths for the next curious person?"
              ],
              tweets: [tweets[0], tweets[4]],
              href: "/digest/2026-09-16/shared-memory",
              relevant: !!q
            },
            {
              slug: "searching-on-foot",
              title: "Let the world choose the next question",
              subtitle:
                "An argument for wandering, noticing, and making room for the unexpected.",
              category: "Ideas",
              bullets: [
                "Sam describes walking as a form of search.",
                "Jules asks what our older curiosities might reveal."
              ],
              tweets: [tweets[3]],
              href: "/digest/2026-09-16/searching-on-foot",
              relevant: false
            }
          ]
        },
        explanation:
          "Published stories related to the current topic appear first. This edition is fictional."
      }
    case "trends": {
      if (!input.q)
        return {
          ...base,
          feature: "trends",
          explanation: "Weekly discoveries from the archive. Sample data.",
          data: {
            term: "",
            granularity: "week",
            buckets: [],
            counts: [],
            per100k: [],
            computedAt: "2026-09-17",
            evidence: [],
            words: ["community memory", "pacing", "gardens", "agents"].map(
              (term, i) => ({
                term,
                posts: 245 - i * 43,
                lane: i === 3 ? "falling" : i === 0 ? "emerging" : "rising",
                changePct: i === 0 ? null : i === 3 ? -24 : 48 + i * 12,
                since: "2026-09-10",
                until: "2026-09-16"
              })
            )
          }
        }

      const buckets = Array.from({ length: 12 }, (_, i) => {
        const d = new Date("2026-09-17T12:00:00Z")
        if (input.granularity === "year") return String(2015 + i)
        if (input.granularity === "day" || input.granularity === "week") {
          d.setUTCDate(
            d.getUTCDate() - (11 - i) * (input.granularity === "week" ? 7 : 1)
          )
          return d.toISOString().slice(0, 10)
        }
        d.setUTCMonth(d.getUTCMonth() - (11 - i))
        return d.toISOString().slice(0, 7)
      })
      const counts = [11, 14, 9, 18, 13, 23, 21, 32, 38, 29, 48, 56]
      return {
        ...base,
        feature: "trends",
        explanation:
          "Matching posts per 100,000 archived tweets. A sample pattern, not live archive measurements.",
        data: {
          term: input.q || "community",
          granularity: input.granularity || "month",
          buckets,
          counts,
          per100k: counts.map((n) => n / 3),
          computedAt: "2026-09-17T12:00:00Z",
          evidence: tweets.slice(0, 2)
        }
      }
    }
    case "graph": {
      const focus = people.find((p) => p.username === input.username) || null
      return {
        ...base,
        feature: "graph",
        explanation:
          "People this author has replied to, ordered by latest reply. Sample data.",
        data: {
          focus,
          neighbors: focus
            ? people
                .filter((p) => p.id !== focus.id)
                .map((p, i) => ({
                  ...p,
                  interactions: 43 - i * 7,
                  strength: 0.21 - i * 0.03,
                  lastInteractionAt: `2026-09-${String(17 - i * 2).padStart(2, "0")}T12:00:00Z`
                }))
            : [],
          generatedAt: "2026-09-17T12:00:00Z",
          timeWindow: "Last 30 days · sample data",
          days: 30,
          truncated: false
        }
      }
    }
  }
}
