export const AUTH_RETURN = "https://www.community-archive.org/"
export type PendingLogin = { tabId: number; expiresAt: number }

/** Only the tab created by this login may supply a one-use PKCE code. */
export function loginCode(
  pending: PendingLogin | undefined,
  tabId: number,
  href: string,
  now = Date.now()
): string | null {
  if (!pending || pending.tabId !== tabId || pending.expiresAt <= now)
    return null
  try {
    const url = new URL(href)
    if (url.origin !== new URL(AUTH_RETURN).origin || url.pathname !== "/")
      return null
    const code = url.searchParams.get("code")
    return code && /^[A-Za-z0-9_-]{8,256}$/.test(code) ? code : null
  } catch {
    return null
  }
}

export function loginReturned(
  pending: PendingLogin | undefined,
  tabId: number,
  href: string
) {
  if (!pending || pending.tabId !== tabId || pending.expiresAt <= Date.now())
    return false
  try {
    const url = new URL(href)
    return url.origin === new URL(AUTH_RETURN).origin && url.pathname === "/"
  } catch {
    return false
  }
}
