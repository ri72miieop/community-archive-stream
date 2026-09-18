import { expect, test } from "bun:test"

import { parseContextArchive } from "./context-archive"

const row = {
  tweetId: "123",
  username: "reader",
  accountDisplayName: "Reader",
  fullText: "A thread worth remembering"
}
const parse = (tweets: unknown[]) => parseContextArchive({ data: { tweets } })

test("missing or non-string author identities cannot crash public context", () => {
  expect(
    parse([
      { ...row, username: null, accountDisplayName: null },
      { ...row, username: undefined },
      { ...row, username: 123 },
      { ...row, username: {} },
      { ...row, tweetId: 123 },
      null,
      row
    ])
  ).toEqual([
    {
      tweetId: "123",
      username: "reader",
      displayName: "Reader",
      text: row.fullText,
      pageKind: "other"
    }
  ])
})

test("absent display names and media-only text have safe display values", () => {
  expect(
    parse([{ ...row, accountDisplayName: null, fullText: null }])[0]
  ).toMatchObject({
    displayName: "reader",
    text: ""
  })
  expect(
    parse([
      { ...row, accountDisplayName: { name: "Reader" } },
      { ...row, fullText: {} }
    ])
  ).toEqual([])
})

test("unexpected response envelopes produce the existing unavailable state", () => {
  expect(() => parseContextArchive({ data: { tweets: null } })).toThrow(
    "unexpected response"
  )
})
