import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { getInterceptedRecordPreview } from "./interceptedRecordPreview"

describe("getInterceptedRecordPreview", () => {
  it("keeps a record with no tweet payload renderable", () => {
    assert.deepEqual(getInterceptedRecordPreview(undefined), {
      text: undefined,
      username: undefined
    })
    assert.deepEqual(getInterceptedRecordPreview({ status: "failed" }), {
      text: undefined,
      username: undefined
    })
  })

  it("shows text and username from a raw tweet", () => {
    assert.deepEqual(getInterceptedRecordPreview({
      legacy: { full_text: "hello" },
      core: { user_results: { result: { legacy: { screen_name: "example" } } } }
    }), { text: "hello", username: "example" })
  })
})
