import { z } from "zod"

import {
  archiveRequestPath,
  type ArchiveInput,
  type ArchiveResult
} from "./archive-contract"

const media = z.object({
  url: z.string(),
  type: z.string(),
  width: z.number().optional(),
  height: z.number().optional()
})
const tweet = z.object({
  id: z.string().regex(/^\d{1,25}$/),
  username: z.string(),
  name: z.string(),
  text: z.string(),
  createdAt: z.string(),
  likes: z.number().finite(),
  rts: z.number().finite(),
  quoteCount: z.number().optional(),
  media: z.array(media).optional(),
  quotedTweet: z
    .object({
      id: z.string(),
      username: z.string(),
      name: z.string(),
      text: z.string(),
      media: z.array(media),
      isDeleted: z.boolean().optional()
    })
    .optional()
})
const person = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string()
})
const payloads = {
  bangers: z.object({
    tweets: z.array(tweet),
    nextOffset: z.number().int().nonnegative().nullable()
  }),
  search: z.object({
    tweets: z.array(tweet),
    nextOffset: z.number().int().nonnegative().nullable()
  }),
  digest: z.object({
    date: z.string().nullable(),
    summary: z.array(z.string()),
    preview: z.boolean(),
    matched: z.boolean(),
    stories: z.array(
      z.object({
        slug: z.string(),
        title: z.string(),
        subtitle: z.string(),
        category: z.string(),
        bullets: z.array(z.string()),
        tweets: z.array(tweet),
        href: z.string(),
        relevant: z.boolean()
      })
    )
  }),
  trends: z.object({
    words: z
      .array(
        z.object({
          term: z.string().min(1),
          lane: z.enum(["emerging", "rising", "falling"]).optional(),
          posts: z.number().finite().nonnegative(),
          changePct: z.number().finite().nullable(),
          since: z.string().optional(),
          until: z.string().optional()
        })
      )
      .optional(),
    term: z.string(),
    granularity: z.string(),
    buckets: z.array(z.string()),
    counts: z.array(z.number().finite().nonnegative()),
    per100k: z.array(z.number().finite().nonnegative()),
    computedAt: z.string(),
    evidence: z.array(tweet)
  }),
  graph: z.object({
    focus: person.nullable(),
    neighbors: z.array(
      person.extend({
        strength: z.number().finite(),
        interactions: z.number().finite(),
        lastInteractionAt: z.string().optional()
      })
    ),
    generatedAt: z.string(),
    timeWindow: z.string(),
    days: z.number().int().positive().optional(),
    truncated: z.boolean()
  })
}
export function parseArchiveResult(
  input: ArchiveInput,
  value: unknown
): ArchiveResult {
  const envelope = z
    .object({
      version: z.literal(1),
      feature: z.literal(input.feature),
      href: z.string(),
      explanation: z.string(),
      data: payloads[input.feature]
    })
    .parse(value)
  if (envelope.feature === "trends") {
    const data = envelope.data as ArchiveResult<"trends">["data"]
    if (
      data.buckets.length !== data.counts.length ||
      data.counts.length !== data.per100k.length
    )
      throw new Error("Incomplete trend series")
  }
  return envelope as ArchiveResult
}
export function caUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//"))
    return "https://www.community-archive.org/"
  const url = new URL(path, "https://www.community-archive.org")
  return url.origin === "https://www.community-archive.org"
    ? url.href
    : "https://www.community-archive.org/"
}
export function mediaUrl(value: string): string | null {
  try {
    const u = new URL(value)
    return u.protocol === "https:" &&
      /^(pbs|video)\.twimg\.com$/.test(u.hostname)
      ? u.href
      : null
  } catch {
    return null
  }
}
export function createArchiveClient(fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, { until: number; value: ArchiveResult }>()
  const pending = new Map<string, Promise<ArchiveResult>>()
  const cooldown = new Map<string, number>()
  return async (
    input: ArchiveInput,
    token?: string,
    owner = ""
  ): Promise<ArchiveResult> => {
    const path = archiveRequestPath(input)
    const key = `${input.feature === "trends" ? owner : "public"}:${path}`
    if (input.feature === "trends" && !token)
      throw new Error("Sign in to Community Archive to explore trends.")
    const cached = cache.get(key)
    if (cached && cached.until > Date.now()) return cached.value
    if ((cooldown.get(input.feature) || 0) > Date.now())
      throw new Error("This view is cooling down. Try again in a minute.")
    if (pending.has(key)) return pending.get(key)!
    const request = (async () => {
      const response = await fetchImpl(caUrl(path), {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(30000),
        headers:
          input.feature === "trends" ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500)
          cooldown.set(
            input.feature,
            Date.now() +
              Math.max(
                30,
                Math.min(300, Number(response.headers.get("retry-after")) || 60)
              ) *
                1000
          )
        throw new Error(
          response.status === 401
            ? "Sign in to Community Archive to explore trends."
            : response.status === 404
              ? "This feature is ready in the extension; its CA API is awaiting release."
              : "This archive view is temporarily unavailable. Try again shortly."
        )
      }
      let value: ArchiveResult
      try {
        value = parseArchiveResult(input, await response.json())
      } catch {
        throw new Error(
          "CA returned an incompatible response. Please update the extension or try again later."
        )
      }
      if (cache.size >= 40) cache.delete(cache.keys().next().value)
      cache.set(key, { until: Date.now() + 120000, value })
      return value
    })()
    pending.set(key, request)
    try {
      return await request
    } finally {
      pending.delete(key)
    }
  }
}
