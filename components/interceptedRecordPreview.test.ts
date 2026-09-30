import { describe, expect, it } from "bun:test"

import { getInterceptedRecordPreview } from "./interceptedRecordPreview"

describe("getInterceptedRecordPreview", () => {
  it("keeps a record with no tweet payload renderable", () => {
    expect(getInterceptedRecordPreview(undefined)).toEqual({
      text: undefined,
      username: undefined
    })
    expect(getInterceptedRecordPreview({ status: "failed" })).toEqual({
      text: undefined,
      username: undefined
    })
  })

  it("shows text and username from a raw tweet", () => {
    expect(getInterceptedRecordPreview({
      legacy: { full_text: "hello" },
      core: { user_results: { result: { legacy: { screen_name: "example" } } } }
    })).toEqual({ text: "hello", username: "example" })
  })
})
