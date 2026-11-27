// Push endpoints come from the browser, and the reminder job sends a POST to them later. Without a
// host allowlist a signed-in person could aim that POST at internal addresses (SSRF), so only the
// services of the browser vendors are accepted.

const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
]
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com']

// Control characters, whitespace and backslashes never belong in an app path: browsers strip tabs
// and newlines and turn "/\" into "//", so "/\evil.example" would become a foreign host. Same rule
// as isAllowedHref in markdown-lite.ts, plus the wider whitespace set of \s.
const UNSAFE_PATH = /[\s\\\x00-\x1f\x7f]/

/** A push service of the browser vendors: https, default port, no credentials, known host. */
export function isPushEndpoint(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  // URL lowercases scheme and host, so the comparison below needs no case folding.
  if (parsed.protocol !== 'https:') return false
  if (parsed.port !== '' && parsed.port !== '443') return false
  if (parsed.username !== '' || parsed.password !== '') return false

  const host = parsed.hostname
  // "fcm.googleapis.com." is a different host for the resolver and must not slip through the suffix.
  if (host.endsWith('.')) return false
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

/** A path inside this app, or /today. Anything else must not be opened from a notification. */
export function safeAppPath(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/')) return '/today'
  if (url[1] === '/' || url[1] === '\\') return '/today'
  return UNSAFE_PATH.test(url) ? '/today' : url
}
