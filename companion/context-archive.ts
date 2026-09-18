import { z } from "zod"

import { tweetSchema, type ReadingTweet } from "./types"

const responseSchema = z.object({
  data: z.object({ tweets: z.array(z.unknown()) })
})
const resultSchema = z.object({
  tweetId: tweetSchema.shape.tweetId,
  username: tweetSchema.shape.username,
  accountDisplayName: tweetSchema.shape.displayName.nullish(),
  fullText: tweetSchema.shape.text.nullish()
})

export function parseContextArchive(payload: unknown): ReadingTweet[] {
  const response = responseSchema.safeParse(payload)
  if (!response.success)
    throw new Error("Public archive returned an unexpected response.")
  return response.data.data.tweets.flatMap((row) => {
    // Check types before applying identity rules. RegExp.test coerces null and
    // undefined to strings, both of which happen to look like valid handles.
    const result = resultSchema.safeParse(row)
    if (!result.success) return []
    const tweet = result.data
    return [
      {
        tweetId: tweet.tweetId,
        username: tweet.username,
        displayName: tweet.accountDisplayName || tweet.username,
        text: tweet.fullText || "",
        pageKind: "other" as const
      }
    ]
  })
}
