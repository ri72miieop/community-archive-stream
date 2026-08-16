import { supabase } from "~core/supabase"

import { db } from "~database"
import {
  cleanupOldRecords,
  ensurePolicySafeIndexedDb
} from "../utils/IndexDB"
import { GlobalCachedData } from "~contents/Storage/CachedData"
import { runIndependentPrivacyStartupTasks } from "./privacyStartup"

// Run database cleanup on extension startup
async function runDatabaseCleanup() {
  await runIndependentPrivacyStartupTasks([
    {
      name: "extension profile cache",
      run: () => GlobalCachedData.ResetAllCache()
    },
    {
      name: "interception history database",
      run: async () => {
        await ensurePolicySafeIndexedDb()
        const deletedRecords = await cleanupOldRecords(7500)
        if (deletedRecords > 0) {
          console.log(
            `Database cleanup completed: ${deletedRecords} old records deleted`
          )
        }
      }
    },
    {
      name: "legacy content database",
      run: () => db.ready()
    }
  ])
}

// Schedule the cleanup to run every 6 hours
function setupPeriodicCleanup() {
  // Run cleanup immediately on startup
  runDatabaseCleanup()

  // Set interval for every 3 hours (3 * 60 * 60 * 1000 ms)
  const THREE_HOURS_MS = 3 * 60 * 60 * 1000
  setInterval(runDatabaseCleanup, THREE_HOURS_MS)
}

// Run on extension startup
setupPeriodicCleanup()

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})

console.log(
  "Live now; make now always the most precious time. Now will never come again."
)

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("options.html")
    })
  }
})
