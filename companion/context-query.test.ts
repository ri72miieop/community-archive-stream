import { describe, expect, test } from "bun:test"

import { contextQuery, keywords } from "./types"

describe("context query", () => {
  test("keeps Twitter and work together instead of querying work alone", () => {
    expect(
      contextQuery(
        "do you use twitter for your work or as a large component of your life? let me talk to you!!! reply and I'll dm you"
      )
    ).toBe("twitter work")
  })
  test("repeated subject outranks a conversational opening", () => {
    const text =
      "I think a reasonable worry about 'pacing' is misunderstandings about pacing interventions. How should we approach pacing frontier AI?"
    expect(keywords(text)[0]).toBe("pacing")
    expect(contextQuery(text)).toBe("pacing")
  })
  test("does not search URLs, handles or generic work alone", () => {
    expect(contextQuery("@someone https://example.com/marketing work")).toBe("")
    expect(contextQuery("Thanks! This is really good")).toBe("")
    expect(contextQuery("AI alignment")).toBe("ai alignment")
  })
})
