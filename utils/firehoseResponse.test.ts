// Bun is the checked-in test runtime; this project does not install @types/bun.
// @ts-ignore
import { describe, expect, test } from "bun:test"

import {
  getPersistableFirehoseRecords,
  POLICY_SAFE_ENVELOPE_MARKER,
  POLICY_TOMBSTONE_MARKER,
  scrubUnverifiedCachedData
} from "./firehoseResponse"

const RECEIVED_AT = "2026-08-15T20:00:00.000Z"
const BLOCKED_SECRET = "NEVER-PERSIST-BLOCKED-CONTENT"

function allowedTweet(tweetId = "1001", accountId = "2001") {
  return {
    __typename: "Tweet",
    rest_id: tweetId,
    core: {
      user_results: {
        result: { __typename: "User", rest_id: accountId }
      }
    },
    legacy: {
      id_str: tweetId,
      user_id_str: accountId,
      full_text: "allowed tweet content"
    }
  }
}

function tombstone(tweetId = "1002", accountId = "2002") {
  return {
    __typename: "Tweet",
    [POLICY_TOMBSTONE_MARKER]: true,
    rest_id: tweetId,
    core: {
      user_results: {
        result: {
          __typename: "User",
          rest_id: accountId,
          core: { name: "", screen_name: "" }
        }
      }
    },
    legacy: {
      id_str: tweetId,
      user_id_str: accountId,
      full_text: "",
      entities: { urls: [], user_mentions: [] }
    }
  }
}

function envelope(tweet = allowedTweet()) {
  return {
    policy_format: POLICY_SAFE_ENVELOPE_MARKER,
    root_tweet_id: tweet.rest_id,
    tweets: [tweet],
    relationships: []
  }
}

function rawResponse(item: Record<string, unknown>) {
  return { success: true, processedRecords: [item] }
}

describe("firehose response persistence boundary", () => {
  test("persists only metadata for an allowed canonical response", () => {
    const result = getPersistableFirehoseRecords(
      rawResponse({
        success: true,
        record: {
          type: "api_home-timeline",
          originator_id: "1001",
          timestamp: "2026-08-15T19:00:00.000Z",
          data: envelope()
        }
      }),
      RECEIVED_AT
    )

    expect(result.unsafeResponseCount).toBe(0)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      originator_id: "1001",
      status: "accepted",
      policy_safe: true,
      policy_format: POLICY_SAFE_ENVELOPE_MARKER,
      canSendToCA: true
    })
    expect(result.records[0]).not.toHaveProperty("data")
    expect(JSON.stringify(result.records[0])).not.toContain("allowed tweet content")
  })

  test("persists a blocked-only accepted response as a content-free tombstone", () => {
    const pollutedTombstone = {
      ...tombstone(),
      extension_only_field: BLOCKED_SECRET
    }
    const result = getPersistableFirehoseRecords(
      rawResponse({
        success: true,
        record: {
          type: "api_tweet-detail",
          originator_id: "1002",
          data: envelope(pollutedTombstone)
        }
      }),
      RECEIVED_AT
    )

    expect(result.records[0]).toMatchObject({
      originator_id: "1002",
      status: "accepted",
      is_tombstone: true,
      tombstone_tweet_ids: ["1002"],
      tombstone_account_ids: ["2002"]
    })
    const serialized = JSON.stringify(result.records[0])
    expect(serialized).not.toContain(BLOCKED_SECRET)
    expect(serialized).not.toContain("extension_only_field")
    expect(result.records[0]).not.toHaveProperty("data")
  })

  test("retains an allowed edge to a canonicalized blocked tombstone", () => {
    const outer = allowedTweet("1003", "2003")
    const blocked = {
      ...tombstone("1004", "2004"),
      extension_only_field: BLOCKED_SECRET
    }
    const result = getPersistableFirehoseRecords(
      rawResponse({
        success: true,
        record: {
          type: "api_tweet-detail",
          originator_id: "1003",
          data: {
            policy_format: POLICY_SAFE_ENVELOPE_MARKER,
            root_tweet_id: "1003",
            tweets: [outer, blocked],
            relationships: [
              {
                type: "QT",
                original_tweet_id: "1003",
                related_tweet_id: "1004"
              }
            ]
          }
        }
      }),
      RECEIVED_AT
    )

    expect(result.unsafeResponseCount).toBe(0)
    expect(result.records[0]).toMatchObject({
      status: "accepted",
      is_tombstone: false,
      has_tombstones: true,
      tombstone_tweet_ids: ["1004"],
      tombstone_account_ids: ["2004"]
    })
    expect(JSON.stringify(result.records[0])).not.toContain(BLOCKED_SECRET)
  })

  test("never persists data returned on a rejected record", () => {
    const result = getPersistableFirehoseRecords(
      rawResponse({
        success: false,
        reason: `${BLOCKED_SECRET} was rejected`,
        record: {
          type: "api_home-timeline",
          originator_id: "1002",
          data: { raw: BLOCKED_SECRET }
        }
      }),
      RECEIVED_AT
    )

    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      originator_id: "1002",
      status: "rejected",
      reason: "FIREHOSE_REJECTED",
      policy_safe: false
    })
    expect(result.records[0]).not.toHaveProperty("data")
    expect(JSON.stringify(result.records)).not.toContain(BLOCKED_SECRET)
  })

  test("rejects a successful legacy raw echo without the canonical marker", () => {
    const result = getPersistableFirehoseRecords(
      rawResponse({
        success: true,
        record: {
          type: "api_home-timeline",
          originator_id: "1002",
          data: { rest_id: "1002", full_text: BLOCKED_SECRET }
        }
      }),
      RECEIVED_AT
    )

    expect(result.unsafeResponseCount).toBe(1)
    expect(result.records[0]).toMatchObject({
      status: "rejected",
      reason: "UNSAFE_FIREHOSE_RESPONSE"
    })
    expect(result.records[0]).not.toHaveProperty("data")
    expect(JSON.stringify(result.records)).not.toContain(BLOCKED_SECRET)
  })

  test("uses policy_safe_data defensively and never falls back to raw data", () => {
    const result = getPersistableFirehoseRecords(
      rawResponse({
        success: true,
        record: {
          type: "api_home-timeline",
          originator_id: "1001",
          data: { raw: BLOCKED_SECRET },
          policy_safe_data: JSON.stringify(envelope())
        }
      }),
      RECEIVED_AT
    )

    expect(result.records[0].status).toBe("accepted")
    expect(JSON.stringify(result.records[0])).not.toContain(BLOCKED_SECRET)
  })

  test("an explicit unsafe marker overrides an otherwise canonical envelope", () => {
    const result = getPersistableFirehoseRecords(
      rawResponse({
        success: true,
        policy_safe: false,
        record: {
          type: "api_home-timeline",
          originator_id: "1001",
          data: envelope()
        }
      }),
      RECEIVED_AT
    )

    expect(result.records[0]).toMatchObject({
      status: "rejected",
      reason: "UNSAFE_FIREHOSE_RESPONSE",
      policy_safe: false
    })
    expect(result.records[0]).not.toHaveProperty("data")
  })

  test("rejects a relationship authored by a blocked tombstone", () => {
    const blocked = tombstone()
    const child = allowedTweet("1005", "2003")
    const result = getPersistableFirehoseRecords(
      rawResponse({
        success: true,
        record: {
          type: "api_tweet-detail",
          originator_id: "1002",
          data: {
            policy_format: POLICY_SAFE_ENVELOPE_MARKER,
            root_tweet_id: "1002",
            tweets: [blocked, child],
            relationships: [
              {
                type: "QT",
                original_tweet_id: "1002",
                related_tweet_id: "1005"
              }
            ]
          }
        }
      }),
      RECEIVED_AT
    )

    expect(result.unsafeResponseCount).toBe(1)
    expect(result.records[0]).toMatchObject({
      status: "rejected",
      reason: "UNSAFE_FIREHOSE_RESPONSE"
    })
    expect(result.records[0]).not.toHaveProperty("data")
  })
})

describe("legacy Dexie cache scrubbing", () => {
  test("normalizes metadata-only failures to a non-content error code", () => {
    const record: Record<string, unknown> = {
      originator_id: "1002",
      reason: BLOCKED_SECRET,
      raw_payload: { full_text: BLOCKED_SECRET },
      tweet: allowedTweet()
    }

    expect(scrubUnverifiedCachedData(record)).toBe(false)
    expect(record).toMatchObject({
      originator_id: "1002",
      status: "rejected",
      reason: "FIREHOSE_REJECTED",
      policy_safe: false
    })
    expect(JSON.stringify(record)).not.toContain(BLOCKED_SECRET)
  })

  test("removes unverified legacy data while retaining non-content status metadata", () => {
    const record: Record<string, unknown> = {
      originator_id: "1002",
      type: "api_home-timeline",
      data: { raw: BLOCKED_SECRET }
    }

    expect(scrubUnverifiedCachedData(record)).toBe(true)
    expect(record).not.toHaveProperty("data")
    expect(record).toMatchObject({
      originator_id: "1002",
      status: "rejected",
      reason: "UNVERIFIED_CACHED_DATA_REMOVED",
      policy_safe: false
    })
    expect(JSON.stringify(record)).not.toContain(BLOCKED_SECRET)
  })

  test("removes even canonical response bodies from the durable cache", () => {
    const record: Record<string, unknown> = {
      originator_id: "1001",
      data: envelope(),
      raw_payload: { full_text: BLOCKED_SECRET },
      forged_tombstones: [{ full_text: BLOCKED_SECRET }]
    }

    expect(scrubUnverifiedCachedData(record)).toBe(true)
    expect(record).toMatchObject({
      status: "accepted",
      policy_safe: true,
      policy_format: POLICY_SAFE_ENVELOPE_MARKER
    })
    expect(record).not.toHaveProperty("data")
    expect(JSON.stringify(record)).not.toContain(BLOCKED_SECRET)
    expect(record).not.toHaveProperty("raw_payload")
  })
})
