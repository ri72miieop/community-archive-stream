import { expect, test } from "bun:test"

import { loginCode } from "./auth-flow"

const pending = { tabId: 7, expiresAt: 2000 }
const href = "https://www.community-archive.org/?code=valid-pkce-code"
test("only accepts the pending auth tab on the exact CA return page", () => {
  expect(loginCode(pending, 7, href, 1000)).toBe("valid-pkce-code")
  for (const url of [
    "https://evil.example/?code=valid-pkce-code",
    "https://www.community-archive.org.evil.example/?code=valid-pkce-code",
    "http://www.community-archive.org/?code=valid-pkce-code",
    "https://www.community-archive.org/settings?code=valid-pkce-code",
    "https://www.community-archive.org/#access_token=token"
  ])
    expect(loginCode(pending, 7, url, 1000)).toBeNull()
  expect(loginCode(pending, 8, href, 1000)).toBeNull()
  expect(loginCode(pending, 7, href, 2000)).toBeNull()
  expect(loginCode(undefined, 7, href, 1000)).toBeNull()
})
