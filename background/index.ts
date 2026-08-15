import { supabase } from "~core/supabase"

import { cleanupOldRecords } from "../utils/IndexDB"

// Run database cleanup on extension startup
async function runDatabaseCleanup() {
  try {
    const deletedRecords = await cleanupOldRecords(7500)
    if (deletedRecords > 0) {
      console.log(
        `Database cleanup completed: ${deletedRecords} old records deleted`
      )
    }
  } catch (error) {
    console.error("Error running database cleanup:", error)
  }
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

const EXTENSION_STATUS_REQUEST = "community-archive:extension-status"
const COMMUNITY_ARCHIVE_HOSTS = new Set([
  "community-archive.org",
  "www.community-archive.org",
  "localhost",
  "127.0.0.1"
])

// The website uses this narrow, read-only handshake to avoid showing install
// suggestions to people who already have the extension. No account, browsing,
// or archive data is exposed.
chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    let senderIsCommunityArchive = false
    try {
      senderIsCommunityArchive =
        typeof sender.url === "string" &&
        COMMUNITY_ARCHIVE_HOSTS.has(new URL(sender.url).hostname)
    } catch {
      senderIsCommunityArchive = false
    }

    if (
      !senderIsCommunityArchive ||
      message?.type !== EXTENSION_STATUS_REQUEST
    ) {
      return
    }

    sendResponse({
      installed: true,
      version: chrome.runtime.getManifest().version
    })
  }
)
