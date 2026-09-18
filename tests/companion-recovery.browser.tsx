// Bundle with Bun as CJS, then call verifyCompanionRecovery() in an isolated tab.
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"

import CompanionBoundary from "../companion/CompanionBoundary"

export function verifyCompanionRecovery() {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  let shouldThrow = true
  let settingsOpened = false
  function View() {
    if (shouldThrow) throw new Error("Expected companion render failure")
    return <p>Companion restored</p>
  }
  const check = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message)
  }
  try {
    flushSync(() =>
      root.render(
        <CompanionBoundary
          openSettings={() => {
            settingsOpened = true
          }}>
          <View />
        </CompanionBoundary>
      )
    )
    check(
      !!container.querySelector('[role="alert"]'),
      "Render failure must show recovery UI"
    )
    const buttons = Array.from(container.querySelectorAll("button"))
    buttons.find((button) => button.textContent === "Account settings")!.click()
    check(
      settingsOpened,
      "Account settings must remain available after a crash"
    )
    shouldThrow = false
    flushSync(() =>
      buttons
        .find((button) => button.textContent === "Reopen companion")!
        .click()
    )
    check(
      container.textContent === "Companion restored",
      "Retry must remount the companion"
    )
    return [
      "render failure is contained",
      "account settings stays available",
      "retry restores the view"
    ]
  } finally {
    flushSync(() => root.unmount())
    container.remove()
  }
}
