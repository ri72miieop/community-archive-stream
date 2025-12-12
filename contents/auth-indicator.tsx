import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useMemo, useRef, useState } from "react"

import iconBase64 from "data-base64:~assets/icon.png"

import { supabase } from "~core/supabase"

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.x.com/*",
    "https://x.com/*",
    "https://*.twitter.com/*",
    "https://twitter.com/*"
  ],
  run_at: "document_end"
}

function useAuthSession(): { isSignedIn: boolean; loading: boolean } {
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubscribed = false

    async function checkSession() {
      try {
        // First, try to refresh the session from storage to ensure we have the latest
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
        
        if (!unsubscribed) {
          if (refreshError) {
            // If refresh fails, fall back to getSession
            const { data, error } = await supabase.auth.getSession()
            if (error) {
              console.error("Auth check error:", error)
              setIsSignedIn(false)
            } else {
              setIsSignedIn(!!data.session)
            }
          } else {
            // Refresh succeeded
            setIsSignedIn(!!refreshData.session)
          }
          setLoading(false)
        }
      } catch (err) {
        console.error("Session check failed:", err)
        if (!unsubscribed) {
          setIsSignedIn(false)
          setLoading(false)
        }
      }
    }

    // Listen for auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!unsubscribed) {
        setIsSignedIn(!!session)
        setLoading(false)
      }
    })

    // Initial check - force refresh to pick up existing sessions
    checkSession()

    // Also listen for chrome.storage changes to catch cross-context auth updates
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === "local") {
        // Check if any Supabase auth keys changed
        const authKeys = Object.keys(changes).filter(key => 
          key.includes("supabase") || key.includes("auth")
        )
        if (authKeys.length > 0 && !unsubscribed) {
          checkSession()
        }
      }
    }

    chrome.storage.onChanged.addListener(storageListener)

    return () => {
      unsubscribed = true
      sub.subscription?.unsubscribe()
      chrome.storage.onChanged.removeListener(storageListener)
    }
  }, [])

  return { isSignedIn, loading }
}

const AuthIndicator = () => {
  const { isSignedIn, loading } = useAuthSession()
  const [showHint, setShowHint] = useState(false)
  const hintTimer = useRef<number | null>(null)

  useEffect(() => {
    if (loading) return
    if (isSignedIn) {
      if (hintTimer.current) window.clearTimeout(hintTimer.current)
      setShowHint(false)
      return
    }

    // Show a brief tooltip on first render when signed out
    setShowHint(true)
    hintTimer.current = window.setTimeout(() => setShowHint(false), 5000)

    return () => {
      if (hintTimer.current) window.clearTimeout(hintTimer.current)
    }
  }, [loading, isSignedIn])

  const isOnOwnOptions = useMemo(() => {
    return window.location.protocol === "chrome-extension:" && window.location.pathname.endsWith("/options.html")
  }, [])

  if (loading || isSignedIn || isOnOwnOptions) return null

  const handleClick = () => {
    try {
      chrome.runtime.openOptionsPage()
    } catch (e) {
      // Best-effort fallback
      const optionsUrl = `chrome-extension://${chrome.runtime.id}/options.html`
      window.open(optionsUrl, "_blank")
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 10,
        left: 10,
        zIndex: 2147483646, // just below extensions UI
        display: "flex",
        alignItems: "center",
        gap: 8,
        pointerEvents: "auto"
      }}>
      {showHint && (
        <div
          style={{
            background: "#111827",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.15)",
            padding: "6px 10px",
            borderRadius: 8,
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            fontSize: 12,
            whiteSpace: "nowrap",
            transform: "translateY(1px)",
            opacity: 0.95
          }}>
          Sign in
        </div>
      )}

      <button
        onClick={handleClick}
        title="Sign in to Community Archive"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.2)",
          background: "#F59E0B",
          boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
          cursor: "pointer"
        }}>
        <img src={iconBase64} alt="Extension icon" style={{ width: 20, height: 20 }} />
      </button>
    </div>
  )
}

export default AuthIndicator




