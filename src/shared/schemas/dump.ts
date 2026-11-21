import { z } from 'zod'

export const DumpLine = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  text: z.string(),
  taskId: z.uuid().nullable(),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
})
export type DumpLine = z.infer<typeof DumpLine>

export const DumpCreate = z.object({
  /** crypto.randomUUID() on the client, before the request; makes offline replays idempotent. */
  clientId: z.uuid(),
  text: z.string().trim().min(1).max(500),
})
export type DumpCreate = z.infer<typeof DumpCreate>
