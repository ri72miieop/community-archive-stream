import { z } from "zod"

import type { PlasmoMessaging } from "@plasmohq/messaging"

import { parseArchiveInput } from "~companion/archive-contract"
import { archive } from "~companion/archive-service"
import {
  captureConfig,
  configure,
  context,
  enqueue,
  exportHistory,
  flush,
  memory,
  snapshot,
  summary
} from "~companion/service"
import { isReadingPage, observationSchema, tweetSchema } from "~companion/types"
import { GlobalCachedData } from "~contents/Storage/CachedData"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const sender = req.sender
    if (sender?.id !== chrome.runtime.id) throw new Error("Invalid sender")
    const action = req.body?.action
    const isPage =
      sender.frameId === 0 &&
      sender.tab?.id !== undefined &&
      isReadingPage(sender.url || "")
    const isPanel =
      sender.url === chrome.runtime.getURL("sidepanel.html") ||
      sender.url === chrome.runtime.getURL("popup.html")
    if (action === "capture-config") {
      if (!isPage) throw new Error("Invalid capture page")
      res.send({ ok: true, data: await captureConfig() })
      return
    }
    if (action === "observe") {
      if (!isPage) throw new Error("Invalid capture page")
      const body = z
        .object({
          current: tweetSchema.nullable(),
          epoch: z.string().uuid().nullable(),
          observations: z.array(observationSchema).max(50)
        })
        .parse(req.body)
      await chrome.storage.session.set({
        [`reading-context:${sender.tab.id}`]: {
          tweet: body.current,
          at: Date.now()
        }
      })
      if (body.epoch && body.observations.length)
        await enqueue(body.epoch, body.observations)
      res.send({ ok: true })
      return
    }
    if (!isPanel)
      throw new Error(
        "Private history is available only in the extension panel"
      )
    let data: unknown
    switch (action) {
      case "archive": {
        const input = z
          .object({
            feature: z.string(),
            q: z.string().optional(),
            username: z.string().optional(),
            offset: z.number().optional(),
            period: z.string().optional(),
            granularity: z.string().optional(),
            graphWindow: z.string().optional(),
            date: z.string().optional()
          })
          .parse(req.body.input)
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(input))
          if (value !== undefined && key !== "feature")
            params.set(key, String(value))
        data = await archive(parseArchiveInput(input.feature, params))
        break
      }
      case "snapshot":
        data = await snapshot(z.number().int().optional().parse(req.body.tabId))
        break
      case "configure":
        data = await configure(
          z.boolean().parse(req.body.enabled),
          false,
          z.string().uuid().parse(req.body.accountId)
        )
        break
      case "clear":
        data = await configure(
          false,
          true,
          z.string().uuid().parse(req.body.accountId)
        )
        break
      case "memory":
        data = await memory(z.string().max(200).parse(req.body.query))
        break
      case "summary":
        data = await summary()
        break
      case "context":
        data = await context(
          tweetSchema.parse(req.body.tweet),
          z.string().trim().max(120).optional().parse(req.body.query)
        )
        break
      case "export":
        data = await exportHistory(z.string().uuid().parse(req.body.accountId))
        break
      case "sync":
        await flush()
        break
      case "contribute": {
        const prefs = await GlobalCachedData.GetEnhancementPreferences()
        await GlobalCachedData.SaveEnhancementPreferences({
          ...prefs,
          interceptData: z.boolean().parse(req.body.enabled)
        })
        break
      }
      default:
        throw new Error("Unknown companion action")
    }
    res.send({ ok: true, data })
  } catch (error) {
    res.send({
      ok: false,
      error: error instanceof Error ? error.message : "Companion request failed"
    })
  }
}
export default handler
