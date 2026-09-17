import type {
  ContextResult,
  Memory,
  PanelSnapshot,
  ReadingTweet,
  Summary
} from "./types"

const now = Date.now()
export const previewTweet: ReadingTweet = {
  tweetId: "1001",
  username: "mira_builds",
  displayName: "Mira",
  text: "What if the best thing a community could build wasn’t another feed, but a shared memory? A way to find the conversations that changed how we think.",
  pageKind: "home"
}
export const previewMemories: Memory[] = [
  {
    tweetId: "2001",
    username: "mira_builds",
    displayName: "Mira",
    text: "The interesting part of an old conversation is often the question everyone left unanswered.",
    pageKind: "home",
    firstSeen: now - 86400000,
    lastSeen: now - 86400000,
    visibleMs: 19000
  },
  {
    tweetId: "2002",
    username: "jules_notes",
    displayName: "Jules",
    text: "A personal archive is a conversation with your past curiosity. What did you notice before you knew why it mattered?",
    pageKind: "thread",
    firstSeen: now - 172800000,
    lastSeen: now - 172800000,
    visibleMs: 27000
  },
  {
    tweetId: "2003",
    username: "sam_on_walks",
    displayName: "Sam",
    text: "Walking is a different way of searching. You let the world choose the next question.",
    pageKind: "home",
    firstSeen: now - 259200000,
    lastSeen: now - 259200000,
    visibleMs: 13000
  }
]
export const previewContext: ContextResult = {
  query: "community",
  archiveError: null,
  archive: [
    {
      tweetId: "3001",
      username: "leah_collects",
      displayName: "Leah",
      text: "A community’s memory lives in the connections between its stories. We preserve the artifacts, but so often lose the paths between them.",
      pageKind: "other"
    },
    {
      tweetId: "3002",
      username: "arden_maps",
      displayName: "Arden",
      text: "The best discovery tools don’t just give you an answer. They remind you of a person who was asking a similar question five years ago.",
      pageKind: "other"
    }
  ],
  memories: previewMemories.slice(0, 2)
}
export const previewSnapshot: PanelSnapshot = {
  account: { id: "preview-account", label: "Preview reader" },
  preferences: { enabled: true, epoch: "preview" },
  current: previewTweet,
  queued: 0,
  error: null,
  contributes: false
}
export const previewSummary: Summary = {
  tweets: 147,
  visibleMs: 42 * 60000,
  authors: [
    { username: "mira_builds", tweets: 14, visibleMs: 720000 },
    { username: "jules_notes", tweets: 11, visibleMs: 540000 },
    { username: "sam_on_walks", tweets: 7, visibleMs: 320000 },
    { username: "leah_collects", tweets: 5, visibleMs: 210000 }
  ],
  days: [4, 7, 3, 9, 5, 6, 8].map((minutes, i) => ({
    day: new Date(now - (6 - i) * 86400000).toISOString().slice(0, 10),
    tweets: 10 + minutes * 2,
    visibleMs: minutes * 60000
  }))
}
