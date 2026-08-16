export const POLICY_SAFE_ENVELOPE_MARKER =
  "community-archive-policy-safe-v1" as const
export const POLICY_TOMBSTONE_MARKER =
  "__community_archive_policy_tombstone" as const

const LEGACY_DATA_REMOVED = "UNVERIFIED_CACHED_DATA_REMOVED"
const UNSAFE_RESPONSE = "UNSAFE_FIREHOSE_RESPONSE"
const SAFE_RECORD_TYPES = new Set([
  "api_home-timeline",
  "api_user-tweets",
  "api_search-timeline",
  "api_tweet-detail",
  "api_liked_tweets",
  "api_list_tweets"
])
const SAFE_ERROR_CODES = new Set([
  "DUPLICATE",
  "POLICY_NOT_ELIGIBLE",
  "FIREHOSE_REJECTED",
  "UNSAFE_FIREHOSE_RESPONSE",
  "UNVERIFIED_CACHED_DATA_REMOVED"
])

type UnknownRecord = Record<string, unknown>

export type PolicySafeRelationship = {
  type: "QT" | "RT"
  original_tweet_id: string
  related_tweet_id: string
}

export type PolicySafeTweetEnvelope = {
  policy_format: typeof POLICY_SAFE_ENVELOPE_MARKER
  root_tweet_id: string
  tweets: UnknownRecord[]
  relationships: PolicySafeRelationship[]
}

export type PersistableFirehoseRecord = {
  originator_id: string
  timestamp: string
  type: string
  date_added: string
  canSendToCA: boolean
  status: "accepted" | "rejected"
  reason?: string
  error_code?: string
  policy_safe: boolean
  policy_format?: typeof POLICY_SAFE_ENVELOPE_MARKER
  is_tombstone?: boolean
  has_tombstones?: boolean
  tombstone_tweet_ids?: string[]
  tombstone_account_ids?: string[]
}

export type FirehosePersistenceResult = {
  records: PersistableFirehoseRecord[]
  unsafeResponseCount: number
}

/**
 * Convert a firehose response to the only records that may be durably cached.
 * Request data is deliberately not accepted as an argument, so it cannot be
 * used as a fallback when the firehose rejects or omits a record.
 */
export function getPersistableFirehoseRecords(
  response: unknown,
  receivedAt = new Date().toISOString()
): FirehosePersistenceResult {
  if (!isObject(response) || !Array.isArray(response.processedRecords)) {
    return { records: [], unsafeResponseCount: 1 }
  }

  const records: PersistableFirehoseRecord[] = []
  let unsafeResponseCount = 0

  for (const value of response.processedRecords) {
    if (!isObject(value) || !isObject(value.record)) {
      unsafeResponseCount++
      continue
    }

    const firehoseRecord = value.record
    const responseId = asStableId(firehoseRecord.originator_id)
    const timestamp = asTimestamp(firehoseRecord.timestamp, receivedAt)
    const type =
      typeof firehoseRecord.type === "string" &&
      SAFE_RECORD_TYPES.has(firehoseRecord.type)
        ? firehoseRecord.type
        : "unknown"

    // Failed/skipped/rejected records are metadata-only even if a buggy or old
    // server echoes data alongside the failure.
    if (value.success !== true) {
      if (!responseId) {
        unsafeResponseCount++
        continue
      }
      const errorCode = getSafeErrorCode(value)
      records.push({
        originator_id: responseId,
        timestamp,
        type,
        date_added: receivedAt,
        canSendToCA: false,
        status: "rejected",
        reason: errorCode,
        error_code: errorCode,
        policy_safe: false
      })
      continue
    }

    const candidate =
      firehoseRecord.policy_safe_data ??
      value.policy_safe_data ??
      firehoseRecord.data
    const envelope = parsePolicySafeTweetEnvelope(candidate)
    const explicitlyUnsafe =
      firehoseRecord.policy_safe === false ||
      value.policy_safe === false ||
      (isObject(candidate) && candidate.policy_safe === false)

    if (
      explicitlyUnsafe ||
      !envelope ||
      (responseId !== undefined && responseId !== envelope.root_tweet_id)
    ) {
      unsafeResponseCount++
      const stableId = responseId ?? envelope?.root_tweet_id
      if (stableId) {
        records.push({
          originator_id: stableId,
          timestamp,
          type,
          date_added: receivedAt,
          canSendToCA: false,
          status: "rejected",
          reason: UNSAFE_RESPONSE,
          error_code: UNSAFE_RESPONSE,
          policy_safe: false
        })
      }
      continue
    }

    const tombstones = getTombstoneMetadata(envelope)
    records.push({
      originator_id: envelope.root_tweet_id,
      timestamp,
      type,
      date_added: receivedAt,
      canSendToCA: true,
      status: "accepted",
      policy_safe: true,
      policy_format: POLICY_SAFE_ENVELOPE_MARKER,
      ...(tombstones.tweetIds.length > 0 && {
        is_tombstone: tombstones.tweetIds.includes(envelope.root_tweet_id),
        has_tombstones: true,
        tombstone_tweet_ids: tombstones.tweetIds,
        tombstone_account_ids: tombstones.accountIds
      }),
    })
  }

  return { records, unsafeResponseCount }
}

/**
 * Remove response bodies from durable browser storage. The extension cannot
 * query authoritative PostgreSQL policy at the IndexedDB write boundary, so
 * only stable IDs and tombstone/status metadata may outlive the response.
 */
export function scrubUnverifiedCachedData(record: UnknownRecord): boolean {
  const hadData = "data" in record
  const envelope =
    record.policy_safe === false
      ? null
      : parsePolicySafeTweetEnvelope(record.data)
  const projected = projectPersistableMetadata(record, envelope, hadData)
  for (const key of Object.keys(record)) delete record[key]
  Object.assign(record, projected)
  return hadData
}

/** Closed-world projection used both by migrations and every IndexedDB read. */
export function projectPersistableMetadata(
  record: UnknownRecord,
  parsedEnvelope?: PolicySafeTweetEnvelope | null,
  hadData = "data" in record
): PersistableFirehoseRecord & { added_at: string } {
  const fallbackTimestamp = "2025-01-01T00:00:00.000Z"
  const originatorId = asStableId(record.originator_id) ?? "0"
  const timestamp = asTimestamp(record.timestamp, fallbackTimestamp)
  const addedAt = asTimestamp(
    record.date_added ?? record.added_at,
    timestamp
  )
  const type =
    typeof record.type === "string" && SAFE_RECORD_TYPES.has(record.type)
      ? record.type
      : "unknown"
  const envelope = parsedEnvelope === undefined
    ? (record.policy_safe === false ? null : parsePolicySafeTweetEnvelope(record.data))
    : parsedEnvelope

  if (envelope) {
    const tombstones = getTombstoneMetadata(envelope)
    return {
      originator_id: envelope.root_tweet_id,
      timestamp,
      type,
      date_added: addedAt,
      added_at: addedAt,
      canSendToCA: true,
      status: "accepted",
      policy_safe: true,
      policy_format: POLICY_SAFE_ENVELOPE_MARKER,
      ...(tombstones.tweetIds.length > 0 && {
        is_tombstone: tombstones.tweetIds.includes(envelope.root_tweet_id),
        has_tombstones: true,
        tombstone_tweet_ids: tombstones.tweetIds,
        tombstone_account_ids: tombstones.accountIds
      })
    }
  }

  if (
    !hadData &&
    record.status === "accepted" &&
    record.policy_safe === true &&
    record.policy_format === POLICY_SAFE_ENVELOPE_MARKER
  ) {
    const tweetIds = safeStableIdArray(record.tombstone_tweet_ids)
    const accountIds = safeStableIdArray(record.tombstone_account_ids)
    return {
      originator_id: originatorId,
      timestamp,
      type,
      date_added: addedAt,
      added_at: addedAt,
      canSendToCA: true,
      status: "accepted",
      policy_safe: true,
      policy_format: POLICY_SAFE_ENVELOPE_MARKER,
      ...(tweetIds.length > 0 && {
        is_tombstone: tweetIds.includes(originatorId),
        has_tombstones: true,
        tombstone_tweet_ids: tweetIds,
        tombstone_account_ids: accountIds
      })
    }
  }

  const errorCode = hadData ? LEGACY_DATA_REMOVED : getSafeErrorCode(record)
  return {
    originator_id: originatorId,
    timestamp,
    type,
    date_added: addedAt,
    added_at: addedAt,
    canSendToCA: false,
    status: "rejected",
    reason: errorCode,
    error_code: errorCode,
    policy_safe: false
  }
}

function safeStableIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(asStableId).filter(Boolean) as string[])].sort(
    (left, right) => left.length - right.length || left.localeCompare(right)
  )
}

export function parsePolicySafeTweetEnvelope(
  value: unknown
): PolicySafeTweetEnvelope | null {
  let candidate = value
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (!isObject(candidate)) return null
  if (candidate.policy_format !== POLICY_SAFE_ENVELOPE_MARKER) return null

  const rootTweetId = asStableId(candidate.root_tweet_id)
  if (!rootTweetId || !Array.isArray(candidate.tweets)) return null
  if (
    !Array.isArray(candidate.relationships) ||
    candidate.tweets.length === 0
  ) {
    return null
  }

  const tweets: UnknownRecord[] = []
  const knownTweetIds = new Set<string>()
  const tombstoneTweetIds = new Set<string>()
  for (const tweet of candidate.tweets) {
    if (!isPolicySafeTweet(tweet)) return null
    const tweetId = getTweetId(tweet)
    if (!tweetId || knownTweetIds.has(tweetId)) return null
    if (isPolicyTombstone(tweet) && !isContentFreeTombstone(tweet)) return null
    if (isPolicyTombstone(tweet)) tombstoneTweetIds.add(tweetId)
    knownTweetIds.add(tweetId)
    tweets.push(
      isPolicyTombstone(tweet)
        ? createCanonicalTombstone(tweetId, getAccountId(tweet)!)
        : tweet
    )
  }
  if (!knownTweetIds.has(rootTweetId)) return null

  const relationships: PolicySafeRelationship[] = []
  for (const relationship of candidate.relationships) {
    if (!isObject(relationship)) return null
    const originalTweetId = asStableId(relationship.original_tweet_id)
    const relatedTweetId = asStableId(relationship.related_tweet_id)
    if (
      (relationship.type !== "QT" && relationship.type !== "RT") ||
      !originalTweetId ||
      !relatedTweetId ||
      tombstoneTweetIds.has(originalTweetId) ||
      !knownTweetIds.has(originalTweetId) ||
      !knownTweetIds.has(relatedTweetId)
    ) {
      return null
    }
    relationships.push({
      type: relationship.type,
      original_tweet_id: originalTweetId,
      related_tweet_id: relatedTweetId
    })
  }

  return {
    policy_format: POLICY_SAFE_ENVELOPE_MARKER,
    root_tweet_id: rootTweetId,
    tweets,
    relationships
  }
}

function isPolicySafeTweet(value: unknown): value is UnknownRecord {
  if (!isObject(value) || value.__typename !== "Tweet") return false
  if (!getTweetId(value) || !getAccountId(value)) return false
  return !(
    "quoted_status_result" in value ||
    "quotedRefResult" in value ||
    (isObject(value.legacy) && "retweeted_status_result" in value.legacy)
  )
}

function isPolicyTombstone(tweet: UnknownRecord): boolean {
  return tweet[POLICY_TOMBSTONE_MARKER] === true
}

function isContentFreeTombstone(tweet: UnknownRecord): boolean {
  const legacy = isObject(tweet.legacy) ? tweet.legacy : null
  const core = isObject(tweet.core) ? tweet.core : null
  const userResults =
    core && isObject(core.user_results) ? core.user_results : null
  const user =
    userResults && isObject(userResults.result) ? userResults.result : null
  const userCore = user && isObject(user.core) ? user.core : null
  const entities = legacy && isObject(legacy.entities) ? legacy.entities : null
  const extendedEntities =
    legacy && isObject(legacy.extended_entities)
      ? legacy.extended_entities
      : null

  return (
    legacy?.full_text === "" &&
    arrayLength(entities?.urls) === 0 &&
    arrayLength(entities?.user_mentions) === 0 &&
    arrayLength(extendedEntities?.media) === 0 &&
    (userCore?.name ?? "") === "" &&
    (userCore?.screen_name ?? "") === "" &&
    user?.profile_bio === undefined &&
    user?.avatar === undefined &&
    user?.banner === undefined
  )
}

function createCanonicalTombstone(
  tweetId: string,
  accountId: string
): UnknownRecord {
  return {
    __typename: "Tweet",
    [POLICY_TOMBSTONE_MARKER]: true,
    rest_id: tweetId,
    core: {
      user_results: {
        result: {
          __typename: "User",
          rest_id: accountId,
          core: {
            created_at: "Thu Jan 01 00:00:00 +0000 1970",
            name: "",
            screen_name: ""
          },
          privacy: { protected: false }
        }
      }
    },
    edit_control: {
      edit_tweet_ids: [tweetId],
      editable_until_msecs: "0",
      is_edit_eligible: false,
      edits_remaining: "0"
    },
    is_translatable: false,
    views: { state: "Enabled" },
    source: "",
    legacy: {
      bookmark_count: 0,
      bookmarked: false,
      conversation_id_str: tweetId,
      created_at: "Thu Jan 01 00:00:00 +0000 1970",
      display_text_range: [0, 0],
      entities: {
        hashtags: [],
        symbols: [],
        urls: [],
        user_mentions: []
      },
      favorite_count: 0,
      favorited: false,
      full_text: "",
      id_str: tweetId,
      is_quote_status: false,
      lang: "und",
      possibly_sensitive: false,
      possibly_sensitive_editable: false,
      quote_count: 0,
      reply_count: 0,
      retweet_count: 0,
      retweeted: false,
      user_id_str: accountId
    }
  }
}

function getTombstoneMetadata(envelope: PolicySafeTweetEnvelope) {
  const tweetIds: string[] = []
  const accountIds = new Set<string>()
  for (const tweet of envelope.tweets) {
    if (!isPolicyTombstone(tweet)) continue
    const tweetId = getTweetId(tweet)
    const accountId = getAccountId(tweet)
    if (tweetId) tweetIds.push(tweetId)
    if (accountId) accountIds.add(accountId)
  }
  return { tweetIds, accountIds: [...accountIds] }
}

function getTweetId(tweet: UnknownRecord): string | undefined {
  const legacy = isObject(tweet.legacy) ? tweet.legacy : null
  return asStableId(tweet.rest_id) ?? asStableId(legacy?.id_str)
}

function getAccountId(tweet: UnknownRecord): string | undefined {
  const legacy = isObject(tweet.legacy) ? tweet.legacy : null
  const core = isObject(tweet.core) ? tweet.core : null
  const userResults =
    core && isObject(core.user_results) ? core.user_results : null
  const user =
    userResults && isObject(userResults.result) ? userResults.result : null
  return asStableId(user?.rest_id) ?? asStableId(legacy?.user_id_str)
}

function getSafeErrorCode(value: UnknownRecord): string {
  for (const field of ["error_code", "code", "status"]) {
    const code = asSafeErrorCode(value[field])
    if (code) return code
  }

  const reason = typeof value.reason === "string" ? value.reason : ""
  if (reason.includes("already sent recently")) return "DUPLICATE"
  if (reason.includes("No opted-in, uploader, or policy-blocked account")) {
    return "POLICY_NOT_ELIGIBLE"
  }
  return "FIREHOSE_REJECTED"
}

function asTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string" && typeof value !== "number") return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

function asStableId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  if (!/^[0-9]{1,20}$/.test(value)) return undefined
  try {
    return BigInt(value) <= 18_446_744_073_709_551_615n ? value : undefined
  } catch {
    return undefined
  }
}

function asSafeErrorCode(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_ERROR_CODES.has(value)
    ? value
    : undefined
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
