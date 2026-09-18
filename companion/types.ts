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
const STOP = new Set(
  "about after again also another because been before being best better both could does doing dont even every from going good have here into just know like make more most much only other over really same should some something than that their them then there these they thing think this those through very want were what when where which while will with would your youre https http twitter".split(
    " "
  )
)
export function keywords(text: string): string[] {
  const words =
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+|@[\w]+/g, "")
      .match(/[\p{L}]{4,}/gu) || []
  return [...new Set(words.filter((word) => !STOP.has(word)))].slice(0, 3)
}
