/**
 * E10-P6: one product event for the metrics of PRD §10. Fire and forget on purpose: an event never
 * blocks a screen, never shows an error and carries no text a person typed. The server drops it in
 * selfhost mode, so no screen has to ask which mode it runs in.
 */
export function trackEvent(name: string, props?: Record<string, string | number | boolean>): void {
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(props ? { name, props } : { name }),
    // A ritual ends with a navigation; keepalive still delivers the event on the way out.
    keepalive: true,
  }).catch(() => {})
}
