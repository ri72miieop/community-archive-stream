import { Mutex } from "async-mutex"

import { Storage } from "@plasmohq/storage"

import { supabase } from "~core/supabase"

import {
  AUTH_RETURN,
  loginCode,
  loginReturned,
  type PendingLogin
} from "./auth-flow"

const key = "companion-login"
const statusKey = "companion-login-status"
const lock = new Mutex()
const userStorage = new Storage({ area: "local" })

export async function startLogin() {
  return lock.runExclusive(async () => {
    const stored = await chrome.storage.session.get(key)
    const pending = stored[key] as PendingLogin | undefined
    if (pending && pending.expiresAt > Date.now()) {
      try {
        await chrome.tabs.update(pending.tabId, { active: true })
        return
      } catch {
        /* A closed auth tab can be replaced. */
      }
    }
    // Keep the verifier and the eventual session in extension storage. The CA
    // homepage receives only a short-lived code, never extension session tokens.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "twitter",
      options: { redirectTo: AUTH_RETURN, skipBrowserRedirect: true }
    })
    if (error || !data.url)
      throw new Error("Could not start sign-in. Please try again.")
    const tab = await chrome.tabs.create({ url: "about:blank", active: true })
    if (tab.id === undefined) throw new Error("Could not open the sign-in tab.")
    await chrome.storage.session.set({
      [key]: { tabId: tab.id, expiresAt: Date.now() + 10 * 60_000 },
      [statusKey]:
        "Finish signing in in the Twitter tab. This extension will connect automatically."
    })
    try {
      await chrome.tabs.update(tab.id, { url: data.url })
    } catch {
      await chrome.storage.session.remove(key)
      throw new Error("Could not open sign-in. Please try again.")
    }
  })
}

export async function finishLogin(tabId: number, href: string) {
  return lock.runExclusive(async () => {
    const stored = await chrome.storage.session.get(key)
    const pending = stored[key] as PendingLogin | undefined
    const code = loginCode(pending, tabId, href)
    if (!code) {
      if (
        loginReturned(pending, tabId, href) &&
        /[?#&]error(?:_code|_description)?=/.test(href)
      ) {
        await chrome.storage.session.remove(key)
        await chrome.storage.session.set({
          [statusKey]:
            "Sign-in was cancelled or declined. You can connect again."
        })
        await chrome.tabs
          .update(tabId, { url: chrome.runtime.getURL("options.html") })
          .catch(() => {})
      }
      return
    }
    // Consume before exchanging: duplicate tab events cannot replay a code.
    await chrome.storage.session.remove(key)
    let success = false
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error || !data.session || data.user?.is_anonymous)
        throw new Error("Sign-in failed")
      const verified = await supabase.auth.getUser(data.session.access_token)
      if (verified.error || !verified.data.user)
        throw new Error("Sign-in failed")
      await userStorage.set("user", verified.data.user)
      success = true
    } catch {
      // Never forward OAuth URLs, provider errors or token bodies into logs/UI.
    }
    if (!success) {
      await supabase.auth.signOut({ scope: "local" })
      await userStorage.remove("user")
    }
    await chrome.storage.session.set({
      [statusKey]: success
        ? "Connected. Return to Twitter and open the companion."
        : "Sign-in did not complete. Please try Connect CA account again."
    })
    // Remove the one-use code from the visible URL and show connection status.
    await chrome.tabs
      .update(tabId, { url: chrome.runtime.getURL("options.html") })
      .catch(() => {})
  })
}

export async function cancelLogin(tabId: number) {
  return lock.runExclusive(async () => {
    const stored = await chrome.storage.session.get(key)
    if (stored[key]?.tabId !== tabId) return
    await chrome.storage.session.remove(key)
    await chrome.storage.session.set({
      [statusKey]: "Sign-in was closed. You can connect again."
    })
  })
}
