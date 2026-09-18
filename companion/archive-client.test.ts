import { describe, expect, test } from "bun:test"

import {
  caUrl,
  createArchiveClient,
  mediaUrl,
  parseArchiveResult
} from "./archive-client"
import { archiveHref, parseArchiveInput } from "./archive-contract"

const bangers = {
  version: 1,
  feature: "bangers",
  href: "/bangers",
  explanation: "",
  data: { tweets: [], nextOffset: null }
}
const trends = {
  version: 1,
  feature: "trends",
  href: "/trends",
  explanation: "",
  data: {
    term: "memory",
    granularity: "month",
    buckets: ["2026-09"],
    counts: [3],
    per100k: [5],
    computedAt: "2026-09-17",
    evidence: []
  }
}
describe("archive transport", () => {
  test("public requests omit auth, deduplicate and cache repeated context", async () => {
    let calls = 0
    const client = createArchiveClient((async (_url, init) => {
      calls++
      expect(init?.headers).toEqual({})
      expect(init?.credentials).toBe("omit")
      return Response.json(bangers)
    }) as typeof fetch)
    await Promise.all([
      client({ feature: "bangers" }),
      client({ feature: "bangers" })
    ])
    await client({ feature: "bangers" })
    expect(calls).toBe(1)
  })
  test("trends require auth and keep cache entries scoped to an account", async () => {
    const tokens: unknown[] = []
    const client = createArchiveClient((async (_url, init) => {
      tokens.push(init?.headers)
      return Response.json(trends)
    }) as typeof fetch)
    await expect(client({ feature: "trends", q: "memory" })).rejects.toThrow(
      "Sign in"
    )
    await client({ feature: "trends", q: "memory" }, "first-token", "first")
    await client({ feature: "trends", q: "memory" }, "second-token", "second")
    expect(tokens).toEqual([
      { Authorization: "Bearer first-token" },
      { Authorization: "Bearer second-token" }
    ])
  })
  test("rate limiting puts the feature on cooldown without retry storms", async () => {
    let calls = 0
    const client = createArchiveClient((async () => {
      calls++
      return new Response("", { status: 429, headers: { "Retry-After": "60" } })
    }) as typeof fetch)
    await expect(client({ feature: "bangers" })).rejects.toThrow("unavailable")
    await expect(
      client({ feature: "bangers", username: "someone" })
    ).rejects.toThrow("cooling down")
    expect(calls).toBe(1)
  })
  test("undeployed APIs and incompatible responses have explicit errors", async () => {
    const client = createArchiveClient(
      (async () => new Response("", { status: 404 })) as typeof fetch
    )
    await expect(
      client({ feature: "graph", username: "alice" })
    ).rejects.toThrow("awaiting release")
    expect(() =>
      parseArchiveResult(
        { feature: "trends" },
        { ...trends, data: { ...trends.data, counts: [] } }
      )
    ).toThrow("Incomplete")
    expect(() =>
      parseArchiveResult({ feature: "bangers" }, { ...bangers, version: 2 })
    ).toThrow()
  })
  test("links and query inputs cannot redirect to arbitrary origins", () => {
    expect(caUrl("//evil.example")).toBe("https://www.community-archive.org/")
    expect(caUrl("/\\evil.example")).toBe("https://www.community-archive.org/")
    expect(mediaUrl("javascript:alert(1)")).toBeNull()
    expect(mediaUrl("https://evil.example/pixel")).toBeNull()
    expect(() =>
      parseArchiveInput("search", new URLSearchParams({ q: "a".repeat(121) }))
    ).toThrow()
    expect(archiveHref({ feature: "graph", username: "alice" })).toBe(
      "/social-graph?person=alice"
    )
  })
})
