import { describe, expect, test } from "bun:test"

import {
  isReadingPage,
  keywords,
  observationSchema,
  type ReadingTweet
} from "./types"
import { VisibilityTracker } from "./visibility"

const tweet: ReadingTweet = {
  tweetId: "123",
  username: "reader",
  displayName: "Reader",
  text: "Shared memory makes communities more interesting",
  pageKind: "home"
}
const candidate = { tweet, ratio: 0.7, distance: 10 }

describe("private reading observations", () => {
  test("prefetched and quickly scrolled tweets never become a memory", () => {
    const tracker = new VisibilityTracker()
    expect(tracker.sample([], 1000, true).observations).toEqual([])
    tracker.sample([candidate], 2000, true)
    expect(tracker.sample([candidate], 3000, true).observations).toEqual([])
    expect(tracker.sample([], 4000, true).observations).toEqual([])
  })
  test("foreground time is cumulative and the same visit keeps a stable ID", () => {
    const tracker = new VisibilityTracker()
    tracker.sample([candidate], 1000, true)
    tracker.sample([candidate], 2000, true)
    const first = tracker.sample([candidate], 3000, true).observations[0]
    const second = tracker.sample([candidate], 4000, true).observations[0]
    expect(first.visibleMs).toBe(2000)
    expect(second.id).toBe(first.id)
    expect(second.visibleMs).toBe(3000)
    expect(observationSchema.safeParse(second).success).toBe(true)
  })
  test("backgrounding ends the visit and does not count hidden time", () => {
    const tracker = new VisibilityTracker()
    tracker.sample([candidate], 1000, true)
    tracker.sample([candidate], 2000, true)
    const old = tracker.sample([candidate], 3000, true).observations[0]
    expect(
      tracker.sample([candidate], 4000, false).observations[0].visibleMs
    ).toBe(2000)
    tracker.sample([candidate], 50000, false)
    tracker.sample([candidate], 51000, true)
    tracker.sample([candidate], 52000, true)
    const next = tracker.sample([candidate], 53000, true).observations[0]
    expect(next.id).not.toBe(old.id)
    expect(next.visibleMs).toBe(2000)
  })
  test("suspension gaps, low visibility, and reset never add phantom attention", () => {
    const tracker = new VisibilityTracker()
    tracker.sample([candidate], 1000, true)
    expect(tracker.sample([candidate], 50000, true).observations).toEqual([])
    tracker.sample([{ ...candidate, ratio: 0.49 }], 51000, true)
    tracker.sample([candidate], 52000, true)
    tracker.reset()
    expect(tracker.sample([candidate], 54000, true).observations).toEqual([])
  })
  test("selects the central tweet but saves all qualifying visible tweets", () => {
    const tracker = new VisibilityTracker()
    const candidates = [
      candidate,
      { ...candidate, distance: 2, tweet: { ...tweet, tweetId: "456" } }
    ]
    tracker.sample(candidates, 1000, true)
    tracker.sample(candidates, 2000, true)
    const result = tracker.sample(candidates, 3000, true)
    expect(result.current?.tweetId).toBe("456")
    expect(result.observations).toHaveLength(2)
  })
  test("duplicate rendered copies of a tweet count once per sample", () => {
    const tracker = new VisibilityTracker()
    tracker.sample([candidate, candidate], 1000, true)
    tracker.sample([candidate, candidate], 2000, true)
    const result = tracker.sample([candidate, candidate], 3000, true)
    expect(result.observations).toHaveLength(1)
    expect(result.observations[0].visibleMs).toBe(2000)
  })
  test("DMs and private routes are excluded, while normal timelines are supported", () => {
    for (const path of [
      "/messages",
      "/messages/123",
      "/i/chat",
      "/settings/privacy",
      "/compose/post",
      "/account/access"
    ])
      expect(isReadingPage(`https://x.com${path}`)).toBe(false)
    expect(isReadingPage("https://x.com/home")).toBe(true)
    expect(isReadingPage("https://twitter.com/user/status/123")).toBe(true)
    expect(isReadingPage("https://x.com.evil.test/home")).toBe(false)
    expect(isReadingPage("http://x.com/home")).toBe(false)
  })
  test("keywords strip links and handles; observation contracts reject arbitrary payloads", () => {
    expect(
      keywords(
        "https://secret.test/somewhere @private shared memory communities"
      )
    ).toEqual(["shared", "memory", "communities"])
    expect(observationSchema.safeParse({ id: "bad", tweet }).success).toBe(
      false
    )
  })
})
