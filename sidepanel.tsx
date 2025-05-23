import { useState } from "react"

import "./prod.css"

import TweetEnhancementConfigTab from "~tabs/TweetEnhancementConfigTab"
import { isDev } from "~utils/devUtils"

const navOptions = [
  {
    key: "tweetEnhancement",
    isEnabled: true,
    label: "Tweet Enhancement",
    description: "Configure tweet enhancement features.",
    component: TweetEnhancementConfigTab
  }
]

const IndexSidePanel = () => {
  const enabledNavOptions = isDev
    ? navOptions
    : navOptions.filter((option) => option.isEnabled)
  const [activeOption, setActiveOption] = useState(enabledNavOptions[0].key)

  const currentIndex = enabledNavOptions.findIndex(
    (option) => option.key === activeOption
  )

  const ActiveComponent =
    enabledNavOptions.find((option) => option.key === activeOption)
      ?.component || null

  return <>{<div>{ActiveComponent && <ActiveComponent />}</div>}</>
}

export default IndexSidePanel
