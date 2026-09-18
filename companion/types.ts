import { z } from "zod"

export const tweetSchema = z.object({
  tweetId: z.string().regex(/^\d{1,25}$/),
  username: z.string().regex(/^[A-Za-z0-9_]{1,15}$/),
  displayName: z.string().max(100),
  text: z.string().max(30000),
  pageKind: z.enum(["home", "thread", "profile", "search", "other"])
})
export type ReadingTweet = z.infer<typeof tweetSchema>
export const observationSchema = z.object({
  id: z.string().uuid(),
  tweet: tweetSchema,
  firstSeen: z.number().int().positive(),
  lastSeen: z.number().int().positive(),
  visibleMs: z.number().int().min(1500).max(7_200_000)
})
export type Observation = z.infer<typeof observationSchema>
export type ReadingPreferences = { enabled: boolean; epoch: string }
export type Memory = ReadingTweet & {
  firstSeen: number
  lastSeen: number
  visibleMs: number
}
export type Summary = {
  tweets: number
  visibleMs: number
  authors: { username: string; tweets: number; visibleMs: number }[]
  days: { day: string; tweets: number; visibleMs: number }[]
}
export type PanelSnapshot = {
  account: { id: string; label: string } | null
  preferences: ReadingPreferences | null
  current: ReadingTweet | null
  queued: number
  error: string | null
  contributes: boolean
}
export type ContextResult = {
  archive: ReadingTweet[]
  memories: Memory[]
  query: string
  archiveError: string | null
  privateError?: string | null
}
export const tweetUrl = (tweet: ReadingTweet) =>
  `https://x.com/${tweet.username}/status/${tweet.tweetId}`
export function isTwitterPage(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === "https:" &&
      /^(www\.)?(x|twitter)\.com$/.test(parsed.hostname)
    )
  } catch {
    return false
  }
}
export function isReadingPage(url: string): boolean {
  if (!isTwitterPage(url)) return false
  return !/^\/(?:messages|i\/chat|i\/connect_people|settings|compose|account|login|logout)(?:\/|$)/.test(
    new URL(url).pathname
  )
}
// Prefer repeated, distinctive topic words. Conversational filler is not a topic.
const STOP = new Set(
  "a an the i im ive ill id me my do dm we us our you youre your they them their he she it its is are was were be been being to of on in at as and or but if for from with without about after again also another because before both could does doing dont even every going good got have here how into just know like let lets make makes more most much only other over really same should some something than that then there these thing think this those through very want what when where which while will would https http today tomorrow yesterday reply thank thanks using use large component talk new need needs almost everyone actually reasonable noticed result hope questions question way one two paper stuff look looking said says say still getting people".split(
    " "
  )
)
const GENERAL = new Set(
  "work life time day world things many interesting best better".split(" ")
)
export function keywords(text: string): string[] {
  const words =
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+|@[\w]+/g, " ")
      .replace(/[’']/g, "")
      .match(/[\p{L}][\p{L}\p{N}]{1,}/gu) || []
  const counts = new Map<string, { count: number; index: number }>()
  words.forEach((word, index) => {
    if (STOP.has(word)) return
    const entry = counts.get(word)
    counts.set(word, {
      count: (entry?.count || 0) + 1,
      index: entry?.index ?? index
    })
  })
  return [...counts]
    .sort(([a, x], [b, y]) => {
      const score = (word: string, n: number) =>
        Math.min(n, 4) * 3 + (GENERAL.has(word) ? -4 : 0)
      return score(b, y.count) - score(a, x.count) || x.index - y.index
    })
    .slice(0, 4)
    .map(([word]) => word)
}
export function contextQuery(text: string): string {
  // Authors often name a precise topic in quotes (e.g. 'pacing'). Preserve
  // that phrase instead of pairing it with incidental prose like 'worry'.
  for (const match of text.matchAll(
    /(?:^|\s)["'“‘]([^"'”’\n]{3,60})["'”’](?=$|[\s:.,;!?])/g
  )) {
    const phrase = match[1].toLowerCase().trim()
    const terms = keywords(phrase)
    if (
      phrase.split(/\s+/).length <= 4 &&
      terms.some((term) => !GENERAL.has(term))
    )
      return phrase
  }
  const terms = keywords(text)
  // Two anchors retain more of the subject than a broad one-word association.
  if (terms.length === 1 && GENERAL.has(terms[0])) return ""
  return terms.slice(0, 2).join(" ")
}
