import { describe, expect, it } from 'vitest'
import { isPushEndpoint, safeAppPath } from '../../src/shared/push-endpoint.ts'

describe('isPushEndpoint', () => {
  it.each([
    ['fcm', 'https://fcm.googleapis.com/fcm/send/dG9rZW46QVBBOTFi'],
    ['mozilla updates', 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB'],
    ['mozilla push', 'https://push.services.mozilla.com/wpush/v1/gAAAAAB'],
    ['apple', 'https://web.push.apple.com/QGxkZW4'],
    ['apple subdomain', 'https://courier.push.apple.com/QGxkZW4'],
    ['windows', 'https://wns2-par02p.notify.windows.com/w/?token=AwYAAAB'],
  ])('accepts a real %s endpoint', (_service, url) => {
    expect(isPushEndpoint(url)).toBe(true)
  })

  it.each([
    ['plain http', 'http://fcm.googleapis.com/x'],
    ['foreign port', 'https://fcm.googleapis.com:8443/x'],
    ['credentials', 'https://user:pw@fcm.googleapis.com/x'],
    ['lookalike host', 'https://fcm.googleapis.com.evil.com/x'],
    ['lookalike apple host', 'https://evilpush.apple.com/x'],
    ['internal address', 'https://10.0.0.5/x'],
    ['localhost', 'https://localhost/x'],
    ['trailing dot', 'https://fcm.googleapis.com./x'],
  ])('refuses %s', (_case, url) => {
    expect(isPushEndpoint(url)).toBe(false)
  })
})

describe('safeAppPath', () => {
  it.each([
    ['/', '/'],
    ['/today', '/today'],
    ['/tasks/1?x=1', '/tasks/1?x=1'],
    ['/\\evil', '/today'],
    ['/\t/evil', '/today'],
    ['//evil', '/today'],
    ['https://evil', '/today'],
    ['', '/today'],
    [undefined, '/today'],
    [42, '/today'],
  ])('%s becomes %s', (url, expected) => {
    expect(safeAppPath(url)).toBe(expected)
  })
})
