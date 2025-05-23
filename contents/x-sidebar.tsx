import iconBase64 from "data-base64:~assets/icon.png"
import cssText from "data-text:~/contents/x-sidebar.css"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState } from "react"
import { sendToBackground } from "@plasmohq/messaging"
// Inject to the webpage itself
import "./x-sidebar-base.css"

export const config: PlasmoCSConfig = {
  matches: [ "https://*.twittter.com/*"]
}

// Inject into the ShadowDOM
export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

export const getShadowHostId = () => "plasmo-x-sidebar"



// Function to attach to your button's click handler



const GoogleSidebar = () => {
  const [isOpen, setIsOpen] = useState(false)



  const openSidePanel = async () => {
    try {
      await sendToBackground({
        name: "open-sidepanel",
        body: {
          open: true
        }
      })
    } catch (error) {
      console.error("Failed to open side panel:", error)
    }
  }

  const openSidePanel2 = async () => {
    try {
      await sendToBackground({
        name: "open-sidepanel",
        body: {
          open: true
        }
      })
    } catch (error) {
      console.error("Failed to close side panel:", error)
    }
  }

  return (
    <div id="sidebar" className={isOpen ? "open" : "closed"}>
      <button className="sidebar-toggle" onClick={openSidePanel2}>
        {isOpen ? "🟡 Close" : "🟣 Open"}
      </button>
    </div>
  )
}

export default GoogleSidebar
