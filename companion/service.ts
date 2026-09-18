import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { Mutex } from "async-mutex"
import Dexie, { type Table } from "dexie"

import { GlobalCachedData } from "~contents/Storage/CachedData"
import { supabase } from "~core/supabase"

import { parseContextArchive } from "./context-archive"
import {
  contextQuery,
  keywords,
  type ContextResult,
  type Memory,
  type Observation,
  type PanelSnapshot,
  type ReadingPreferences,
  type ReadingTweet,
  type Summary
} from "./types"

type Pending = Observation & { ownerId: string; epoch: string }
const queue = new Dexie("ca-private-reading-outbox") as Dexie & {
  events: Table<Pending>
}
queue.version(1).stores({ events: "[ownerId+id], ownerId, lastSeen" })
const mutex = new Mutex()
let prefsCache: {
  ownerId: string
  value: ReadingPreferences | null
  at: number
} | null = null
let syncError: string | null = null
let exporting = false
const timeout = () => AbortSignal.timeout(12000)
type Reader = { id: string; label: string; client: SupabaseClient }
let requestClient: { token: string; client: SupabaseClient } | null = null

async function account(): Promise<Reader | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const user = data.session?.user
  if (!user || user.is_anonymous) return null
  // Bind each operation to the JWT read with its owner. A concurrent sign-out or
  // account switch must never retarget an in-flight clear/export to another user.
  if (requestClient?.token !== data.session.access_token) {
    requestClient = {
      token: data.session.access_token,
      client: createClient(
        process.env.PLASMO_PUBLIC_SUPABASE_URL,
        process.env.PLASMO_PUBLIC_SUPABASE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          },
          global: {
            headers: { Authorization: `Bearer ${data.session.access_token}` }
          }
        }
      )
    }
  }
  return {
    id: user.id,
    client: requestClient.client,
    label:
      user.app_metadata?.user_name ||
      user.user_metadata?.user_name ||
      user.email ||
      "Your account"
  }
}

async function preferences(
  user: Reader,
  fresh = false
): Promise<ReadingPreferences | null> {
  const ownerId = user.id
  if (
    !fresh &&
    prefsCache?.ownerId === ownerId &&
    Date.now() - prefsCache.at < 15000
  )
    return prefsCache.value
  const { data, error } = await user.client
    .from("private_reading_preferences")
    .select("enabled,epoch")
    .eq("owner_id", ownerId)
    .abortSignal(timeout())
    .maybeSingle()
  if (error) throw error
  prefsCache = { ownerId, value: data, at: Date.now() }
  return data
}

export async function captureConfig() {
  if (exporting) return { enabled: false, epoch: null }
  try {
    const user = await account()
    if (!user) return { enabled: false, epoch: null }
    const prefs = await preferences(user)
    return { enabled: prefs?.enabled === true, epoch: prefs?.epoch ?? null }
  } catch {
    return { enabled: false, epoch: null }
  }
}

export async function enqueue(epoch: string, observations: Observation[]) {
  return mutex.runExclusive(async () => {
    if (exporting) return
    const user = await account()
    if (!user) return
    const prefs = await preferences(user)
    if (!prefs?.enabled || prefs.epoch !== epoch) return
    const now = Date.now()
    const valid = observations.filter(
      (o) =>
        o.firstSeen >= now - 86400000 &&
        o.lastSeen <= now + 300000 &&
        o.lastSeen >= o.firstSeen &&
        o.visibleMs <= o.lastSeen - o.firstSeen + 1500
    )
    await queue.transaction("rw", queue.events, async () => {
      for (const event of valid) {
        const existing = await queue.events.get([user.id, event.id])
        if (!existing || event.visibleMs >= existing.visibleMs)
          await queue.events.put({ ...event, ownerId: user.id, epoch })
      }
      await queue.events
        .where("lastSeen")
        .below(now - 86400000)
        .delete()
      const excess = (await queue.events.count()) - 1000
      if (excess > 0) {
        const keys = await queue.events
          .orderBy("lastSeen")
          .limit(excess)
          .primaryKeys()
        await queue.events.bulkDelete(keys)
        syncError =
          "Offline buffer filled; the oldest unsynced observations were removed."
      }
    })
  })
}

export async function flush() {
  return mutex.runExclusive(async () => {
    try {
      const user = await account()
      if (!user) {
        await queue.events.clear()
        prefsCache = null
        return
      }
      // Never move an old account's queue into a new session.
      await queue.events
        .filter(
          (row) =>
            row.ownerId !== user.id || row.lastSeen < Date.now() - 86400000
        )
        .delete()
      for (let batchIndex = 0; batchIndex < 5; batchIndex++) {
        const pending = await queue.events
          .where("ownerId")
          .equals(user.id)
          .limit(50)
          .toArray()
        if (!pending.length) return
        const prefs = await preferences(user, batchIndex === 0)
        const stale = pending.filter(
          (p) => !prefs?.enabled || p.epoch !== prefs.epoch
        )
        await queue.events.bulkDelete(stale.map((p) => [p.ownerId, p.id]))
        const batch = pending.filter(
          (p) => prefs?.enabled && p.epoch === prefs.epoch
        )
        if (!batch.length) return
        // Ownership and consent are checked again by Postgres under a row lock.
        const { data, error } = await user.client
          .rpc("record_private_reading", {
            p_epoch: prefs.epoch,
            p_events: batch.map(
              ({ ownerId: _owner, epoch: _epoch, ...event }) => event
            )
          })
          .abortSignal(timeout())
        if (error) throw error
        await queue.events.bulkDelete(batch.map((p) => [p.ownerId, p.id]))
        if (data === 0) {
          prefsCache = null
          return
        }
        syncError = null
      }
    } catch {
      syncError =
        "Private history has not synced. Kept on this device for retry (up to 24 hours / 1,000 observations)."
    }
  })
}

export async function configure(
  enabled: boolean,
  clear: boolean,
  expectedOwner: string
) {
  return mutex.runExclusive(async () => {
    const user = await account()
    if (!user) throw new Error("Sign in to save private history.")
    if (user.id !== expectedOwner)
      throw new Error(
        "Account changed. Refresh the panel before changing history."
      )
    const { data, error } = await user.client
      .rpc("configure_private_reading", { p_enabled: enabled, p_clear: clear })
      .abortSignal(timeout())
    if (error)
      throw new Error(
        "Could not change private history. Please reconnect and try again."
      )
    await queue.events.where("ownerId").equals(user.id).delete()
    prefsCache = { ownerId: user.id, value: data, at: Date.now() }
    syncError = null
    return data as ReadingPreferences
  })
}

export async function snapshot(tabId?: number): Promise<PanelSnapshot> {
  const user = await account()
  let prefs: ReadingPreferences | null = null
  let error: string | null = syncError
  if (user) {
    try {
      prefs = await preferences(user)
    } catch {
      error =
        "Private history is unavailable. Check your connection and try again."
    }
  }
  const stored =
    tabId === undefined
      ? {}
      : await chrome.storage.session.get(`reading-context:${tabId}`)
  const context = stored[`reading-context:${tabId}`]
  const current =
    context && Date.now() - context.at < 15000 ? context.tweet : null
  const legacy = await GlobalCachedData.GetEnhancementPreferences()
  return {
    account: user ? { id: user.id, label: user.label } : null,
    preferences: prefs,
    current,
    queued: user
      ? await queue.events.where("ownerId").equals(user.id).count()
      : 0,
    error,
    contributes: legacy.interceptData
  }
}

function toMemory(row: any): Memory {
  return {
    tweetId: row.tweet_id,
    username: row.username,
    displayName: row.display_name,
    text: row.full_text,
    pageKind: row.page_kind,
    firstSeen: Date.parse(row.first_seen),
    lastSeen: Date.parse(row.last_seen),
    visibleMs: row.visible_ms
  }
}

export async function memory(
  query = "",
  username = "",
  limit = 40
): Promise<Memory[]> {
  const user = await account()
  if (!user) return []
  const { data, error } = await user.client
    .rpc("search_private_reading", {
      p_query: query,
      p_username: username,
      p_limit: limit
    })
    .abortSignal(timeout())
  if (error) throw new Error("Your private history could not be loaded.")
  return (data ?? []).map(toMemory)
}

export async function summary(): Promise<Summary> {
  const user = await account()
  if (!user) return { tweets: 0, visibleMs: 0, authors: [], days: [] }
  const { data, error } = await user.client
    .rpc("summarize_private_reading")
    .abortSignal(timeout())
  if (error) throw new Error("Your attention summary could not be loaded.")
  return data
}

// Public context is bounded and contains no history, account IDs or timing.
const archiveCache = new Map<string, { at: number; tweets: ReadingTweet[] }>()
let archiveBackoffUntil = 0
async function archiveSearch(query: string): Promise<ReadingTweet[]> {
  if (!query) return []
  const cached = archiveCache.get(query)
  if (cached && Date.now() - cached.at < 300000) return cached.tweets
  if (Date.now() < archiveBackoffUntil)
    throw new Error("Archive search is cooling down")
  const params = new URLSearchParams({
    q: query,
    mode: "all",
    limit: "4",
    offset: "0",
    preview: "true",
    exclude_retweets: "true"
  })
  const response = await fetch(
    `https://www.community-archive.org/api/tweet-search?${params}`,
    { credentials: "omit", referrerPolicy: "no-referrer", signal: timeout() }
  )
  if (!response.ok) {
    const retrySeconds = Number(response.headers.get("retry-after")) || 60
    archiveBackoffUntil =
      Date.now() + Math.min(300, Math.max(30, retrySeconds)) * 1000
    throw new Error("Public archive is temporarily unavailable.")
  }
  const tweets = parseContextArchive(await response.json())
  if (archiveCache.size >= 30)
    archiveCache.delete(archiveCache.keys().next().value)
  archiveCache.set(query, { at: Date.now(), tweets })
  return tweets
}

export async function context(
  tweet: ReadingTweet,
  override?: string
): Promise<ContextResult> {
  const terms = keywords(tweet.text)
  const query = override?.trim() || contextQuery(tweet.text)
  const [archive, related, author] = await Promise.allSettled([
    archiveSearch(query),
    terms.length ? memory(terms.join(" OR "), "", 5) : Promise.resolve([]),
    memory("", tweet.username, 4)
  ])
  const memories = [related, author]
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((t) => t.tweetId !== tweet.tweetId)
  return {
    archive:
      archive.status === "fulfilled"
        ? archive.value.filter((t) => t.tweetId !== tweet.tweetId)
        : [],
    memories: [...new Map(memories.map((t) => [t.tweetId, t])).values()].slice(
      0,
      4
    ),
    query,
    archiveError:
      archive.status === "rejected"
        ? "Public archive is temporarily unavailable."
        : null,
    privateError:
      related.status === "rejected" || author.status === "rejected"
        ? "Your private context could not be loaded. Try again when connected."
        : null
  }
}

export async function exportHistory(expectedOwner: string) {
  if (exporting) throw new Error("An export is already running.")
  exporting = true
  try {
    const initial = await account()
    if (!initial) throw new Error("Sign in to export history.")
    if (initial.id !== expectedOwner)
      throw new Error("Account changed; export cancelled.")
    // Drain the complete local queue, not just the first 50 observations.
    for (let attempt = 0; attempt < 21; attempt++) {
      const pending = await queue.events
        .where("ownerId")
        .equals(initial.id)
        .count()
      if (!pending) break
      await flush()
      if (syncError)
        throw new Error(
          "Connect and sync private history before exporting. Nothing has been deleted."
        )
    }
    if ((await account())?.id !== initial.id)
      throw new Error("Account changed; export cancelled.")
    // Freeze the account before pagination so a second device cannot move rows.
    const paused = await configure(false, false, initial.id)
    const user = initial
    const rows: unknown[] = []
    let after: string | null = null
    while (true) {
      if ((await account())?.id !== user.id)
        throw new Error("Account changed; export cancelled.")
      const currentPreferences = await preferences(user, true)
      if (
        currentPreferences?.enabled ||
        currentPreferences?.epoch !== paused.epoch
      )
        throw new Error(
          "History settings changed on another device. Export cancelled; please try again."
        )
      let request = user.client
        .from("private_reading_events")
        .select("*")
        .eq("owner_id", user.id)
        .order("id")
        .limit(500)
      if (after) request = request.gt("id", after)
      const { data, error } = await request.abortSignal(timeout())
      if (error)
        throw new Error("Export failed. History remains paused; try again.")
      if (!data.length) break
      rows.push(...data)
      after = data[data.length - 1].id
    }
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      observations: rows
    }
  } finally {
    exporting = false
  }
}
