// Bun is the checked-in test runtime; this project does not install @types/bun.
// @ts-ignore
import { describe, expect, test } from "bun:test"
import Dexie from "dexie"
import { IDBKeyRange, indexedDB } from "fake-indexeddb"

import { DatabaseManager } from "../database/manager"
import { runIndependentPrivacyStartupTasks } from "../background/privacyStartup"

const BLOCKED_SECRET = "NEVER-PERSIST-BLOCKED-CONTENT"

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

describe("privacy-safe IndexedDB startup upgrades", () => {
  test("upgrades tes from v2 and projects every record to metadata", async () => {
    await Dexie.delete("tes")

    const legacy = new Dexie("tes")
    legacy.version(1).stores({
      data: "originator_id, timestamp, canSendToCA",
      userMentions: "id,timestamp",
      profiles: "user_id, username, updated_at",
      moots: "++id, owner_id, user_id, updated_at",
      followers: "++id, owner_id, user_id, updated_at",
      follows: "++id, owner_id, user_id, updated_at"
    })
    legacy.version(2).stores({
      data: "originator_id, timestamp, canSendToCA, added_at"
    })
    await legacy.open()
    await legacy.table("data").put({
      originator_id: "1001",
      timestamp: "2026-08-15T20:00:00.000Z",
      added_at: "2026-08-15T20:00:00.000Z",
      type: "api_tweet-detail",
      canSendToCA: true,
      unsafe_legacy_field: BLOCKED_SECRET,
      data: {
        tweets: [{ rest_id: "1001", legacy: { full_text: BLOCKED_SECRET } }]
      }
    })
    await legacy.table("profiles").put({
      user_id: "2001",
      username: BLOCKED_SECRET,
      updated_at: "2026-08-15T20:00:00.000Z"
    })
    legacy.close()

    const { ensurePolicySafeIndexedDb, indexDB } = await import("./IndexDB")
    await ensurePolicySafeIndexedDb()

    expect(indexDB.verno).toBe(4)
    expect(indexDB.tables.map(({ name }) => name).sort()).toEqual(["data"])
    const upgraded = await indexDB.table("data").get("1001")
    expect(upgraded).toMatchObject({
      originator_id: "1001",
      type: "api_tweet-detail",
      status: "rejected",
      policy_safe: false,
      error_code: "UNVERIFIED_CACHED_DATA_REMOVED"
    })
    expect(upgraded).not.toHaveProperty("data")
    expect(upgraded).not.toHaveProperty("unsafe_legacy_field")
    expect(JSON.stringify(upgraded)).not.toContain(BLOCKED_SECRET)

    indexDB.close()
    await Dexie.delete("tes")
  })

  test("upgrades the package database from v1 and drops content tables", async () => {
    const databaseName = `community-archive-stream-test-${Date.now()}`
    const legacy = new Dexie(databaseName)
    legacy.version(1).stores({
      tweets: "rest_id",
      users: "rest_id",
      captures: "id,extension,type,created_at"
    })
    await legacy.open()
    await legacy.table("tweets").put({
      rest_id: "1002",
      legacy: { full_text: BLOCKED_SECRET }
    })
    await legacy.table("users").put({
      rest_id: "2002",
      legacy: { description: BLOCKED_SECRET }
    })
    await legacy.table("captures").put({
      id: "test-1002",
      extension: "test",
      type: "tweet",
      data_key: "1002",
      created_at: Date.now()
    })
    legacy.close()

    const manager = new DatabaseManager(databaseName)
    await manager.ready()
    manager.close()

    const upgraded = new Dexie(databaseName)
    await upgraded.open()
    expect(upgraded.verno).toBe(2)
    expect(upgraded.tables.map(({ name }) => name).sort()).toEqual(["captures"])
    expect(await upgraded.table("captures").count()).toBe(1)
    expect(JSON.stringify(await upgraded.table("captures").toArray()))
      .not.toContain(BLOCKED_SECRET)

    upgraded.close()
    await Dexie.delete(databaseName)
  })

  test("runs every privacy startup task when one task fails", async () => {
    const completed: string[] = []
    const failures: string[] = []

    await runIndependentPrivacyStartupTasks([
      {
        name: "profile cache",
        run: () => {
          throw new Error(BLOCKED_SECRET)
        }
      },
      {
        name: "interception history",
        run: async () => {
          completed.push("interception history")
        }
      },
      {
        name: "legacy content",
        run: async () => {
          completed.push("legacy content")
        }
      }
    ], (taskName) => {
      failures.push(taskName)
    })

    expect(completed.sort()).toEqual([
      "interception history",
      "legacy content"
    ])
    expect(failures).toEqual(["profile cache"])
  })
})
