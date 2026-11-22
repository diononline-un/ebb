import type { ZodError } from 'zod'
import type { AppContext } from '../app-env.ts'

// Shared request plumbing for every route module. New routes use these instead of copying them.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A path id that is not a uuid names nothing; answering 404 keeps it out of the database. */
export function idOrNull(value: string): string | null {
  return UUID.test(value) ? value : null
}

/** zod issues as { field: [reason] }, so a form can point at the field that failed. */
export function fieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const name = issue.path.map(String).join('.') || '_'
    fields[name] = [...(fields[name] ?? []), issue.message]
  }
  return fields
}

/** The one 400 shape of the API: { code: 'invalid_body', fields }. */
export function invalidBody(c: AppContext, fields: Record<string, string[]>): Response {
  return c.json({ code: 'invalid_body', fields }, 400)
}

/** The JSON body, or the 400 answer for a body that is not JSON. */
export async function readJson(c: AppContext): Promise<{ body: unknown } | { response: Response }> {
  try {
    return { body: await c.req.json() }
  } catch {
    return { response: invalidBody(c, { _: ['invalid_json'] }) }
  }
}

export function notFound(c: AppContext): Response {
  return c.json({ code: 'not_found' }, 404)
}
