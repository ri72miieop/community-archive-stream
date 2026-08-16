// Bun is the checked-in test runtime; this project does not install @types/bun.
// @ts-ignore
import { describe, expect, test } from "bun:test"

// @ts-ignore -- The production preflight is plain ESM so Node can run it.
import { validateProductionEnvironment } from "./validate-production-env.mjs"

describe("production build environment", () => {
  test("fails closed when endpoint or token is missing", () => {
    expect(validateProductionEnvironment({})).toEqual([
      "PLASMO_PUBLIC_FIREHOSE_API_ENDPOINT_URL is required",
      "PLASMO_PUBLIC_API_AUTH_TOKEN is required"
    ])
  })

  test("requires an HTTPS endpoint", () => {
    expect(validateProductionEnvironment({
      PLASMO_PUBLIC_FIREHOSE_API_ENDPOINT_URL: "http://firehose.example.invalid",
      PLASMO_PUBLIC_API_AUTH_TOKEN: "fixture-public-token"
    })).toEqual([
      "PLASMO_PUBLIC_FIREHOSE_API_ENDPOINT_URL must use HTTPS"
    ])
  })

  test("accepts configured non-secret fixture values", () => {
    expect(validateProductionEnvironment({
      PLASMO_PUBLIC_FIREHOSE_API_ENDPOINT_URL: "https://firehose.example.invalid",
      PLASMO_PUBLIC_API_AUTH_TOKEN: "fixture-public-token"
    })).toEqual([])
  })
})
