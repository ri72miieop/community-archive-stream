import type { Provider, User } from "@supabase/supabase-js"
import { useEffect, useState } from "react"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"

import { supabase } from "~core/supabase"
import { DevLog } from "~utils/devUtils"
import SignIn from "~components/SignIn"

const Popup = () => {
  useEffect(() => {
    chrome.runtime.openOptionsPage()
    window.close()
  }, [])

  return null
}

export default Popup
