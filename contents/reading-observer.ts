import type { PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"

import { readVisibleTweets } from "~companion/dom"
import { isReadingPage, type Observation } from "~companion/types"
import { VisibilityTracker } from "~companion/visibility"

export const config: PlasmoCSConfig = {
  matches: [
    "https://x.com/*",
    "https://www.x.com/*",
    "https://twitter.com/*",
    "https://www.twitter.com/*"
  ],
  all_frames: false,
  run_at: "document_idle"
}

const tracker = new VisibilityTracker()
let consent: { enabled: boolean; epoch: string | null } = {
  enabled: false,
  epoch: null
}
let pending = new Map<string, Observation>()
let polling = false
let ticks = 0
let lastActivity = Date.now()
const activity = () => {
  lastActivity = Date.now()
}
for (const event of ["pointerdown", "pointermove", "keydown", "scroll"])
  window.addEventListener(event, activity, { passive: true })

async function sample() {
  if (polling) return
  polling = true
  try {
    if (!isReadingPage(location.href)) {
      tracker.reset()
      pending.clear()
      return
    }
    if (ticks++ % 5 === 0) {
      const response = await sendToBackground({
        name: "companion",
        body: { action: "capture-config" }
      })
      const next = response.ok ? response.data : { enabled: false, epoch: null }
      if (consent.epoch !== next.epoch || consent.enabled !== next.enabled) {
        tracker.reset()
        pending.clear()
      }
      consent = next
    }
    const foreground =
      document.visibilityState === "visible" &&
      document.hasFocus() &&
      Date.now() - lastActivity < 60000
    const candidates = readVisibleTweets()
    const result = tracker.sample(candidates, Date.now(), foreground)
    // Looking at the companion stops dwell counting, but must not erase context.
    const current =
      document.visibilityState === "visible"
        ? [...candidates].sort((a, b) => a.distance - b.distance)[0]?.tweet ??
          null
        : null
    if (consent.enabled)
      for (const event of result.observations) pending.set(event.id, event)
    else {
      tracker.reset()
      pending.clear()
    }
    // Bounded page-memory retry buffer; durable queue lives in the extension origin.
    while (pending.size > 100) pending.delete(pending.keys().next().value)
    const batch = [...pending.values()].slice(0, 50)
    const response = await sendToBackground({
      name: "companion",
      body: {
        action: "observe",
        current,
        epoch: consent.epoch,
        observations: consent.enabled ? batch : []
      }
    })
    if (response.ok) for (const event of batch) pending.delete(event.id)
  } catch {
    // No content, tokens, page URLs, or history in logs.
  } finally {
    polling = false
  }
}
const timer = setInterval(sample, 1000)
document.addEventListener("visibilitychange", sample)
window.addEventListener("blur", sample)
window.addEventListener(
  "pagehide",
  () => {
    void sample()
    clearInterval(timer)
  },
  { once: true }
)
void sample()
