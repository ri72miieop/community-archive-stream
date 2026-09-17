import { useEffect, useState } from "react"

export default function Popup() {
  const [windowId, setWindowId] = useState<number>()
  const [error, setError] = useState("")
  useEffect(() => {
    chrome.windows.getCurrent().then((win) => setWindowId(win.id))
  }, [])
  return (
    <main
      style={{
        width: 240,
        padding: 18,
        fontFamily: "system-ui",
        color: "#264b40",
        background: "#faf8f2"
      }}>
      <strong>Community Archive</strong>
      <p>Your context, memory & attention.</p>
      <button
        disabled={windowId === undefined}
        onClick={() => {
          chrome.sidePanel
            .open({ windowId })
            .then(() => window.close())
            .catch(() =>
              setError("Use Chrome 116 or newer to open the companion.")
            )
        }}>
        Open companion
      </button>
      {error && <p role="alert">{error}</p>}
      <p>
        <button onClick={() => chrome.runtime.openOptionsPage()}>
          Account & extension settings
        </button>
      </p>
    </main>
  )
}
