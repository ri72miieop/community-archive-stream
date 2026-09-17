import type { Observation, ReadingTweet } from "./types"

export type Candidate = { tweet: ReadingTweet; ratio: number; distance: number }

/** Counts only continuously visible, foreground intervals. Fetching is not seeing. */
export class VisibilityTracker {
  private active = new Map<string, Observation>()
  private previous: number | null = null
  constructor(private uuid = () => crypto.randomUUID()) {}

  sample(
    candidates: Candidate[],
    now: number,
    foreground: boolean
  ): { current: ReadingTweet | null; observations: Observation[] } {
    const elapsed = this.previous === null ? 0 : now - this.previous
    // A suspended timer must not become minutes of apparent reading.
    const delta = foreground && elapsed > 0 && elapsed <= 1500 ? elapsed : 0
    const visible = foreground
      ? [
          ...new Map(
            candidates
              .filter((c) => c.ratio >= 0.5)
              .map((c) => [c.tweet.tweetId, c])
          ).values()
        ]
      : []
    const ids = new Set(visible.map((c) => c.tweet.tweetId))
    const observations: Observation[] = []
    for (const [id, observation] of this.active) {
      if (!ids.has(id)) {
        if (observation.visibleMs >= 1500) observations.push({ ...observation })
        this.active.delete(id)
      }
    }
    for (const { tweet } of visible) {
      let observation = this.active.get(tweet.tweetId)
      if (!observation || observation.visibleMs >= 7_000_000) {
        observation = {
          id: this.uuid(),
          tweet,
          firstSeen: now,
          lastSeen: now,
          visibleMs: 0
        }
        this.active.set(tweet.tweetId, observation)
      } else {
        observation.visibleMs += delta
        observation.lastSeen = now
        observation.tweet = tweet
      }
      if (observation.visibleMs >= 1500) observations.push({ ...observation })
    }
    this.previous = foreground ? now : null
    const current =
      [...visible].sort((a, b) => a.distance - b.distance)[0]?.tweet ?? null
    return { current, observations }
  }
  reset() {
    this.active.clear()
    this.previous = null
  }
}
