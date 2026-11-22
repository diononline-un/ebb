import { z } from 'zod'

// API shapes for shared spaces (E7). A person has one personal space and may join any number of
// shared ones; the invitation token is only ever returned once, at creation.

export const SpaceKind = z.enum(['personal', 'shared'])
export const SpaceRole = z.enum(['owner', 'member'])

export const Space = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: SpaceKind,
  role: SpaceRole,
  memberCount: z.number().int(),
})
export type Space = z.infer<typeof Space>

export const SpaceCreate = z.object({ name: z.string().trim().min(1).max(80) })
export type SpaceCreate = z.infer<typeof SpaceCreate>

export const SpacePatch = z.object({ name: z.string().trim().min(1).max(80) })
export type SpacePatch = z.infer<typeof SpacePatch>

export const InviteCreate = z.object({ email: z.email().optional() })
export type InviteCreate = z.infer<typeof InviteCreate>

/** The one moment the token is visible; only its hash is stored. */
export const InviteIssued = z.object({
  id: z.uuid(),
  token: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
})
export type InviteIssued = z.infer<typeof InviteIssued>

export const InviteJoin = z.object({ token: z.string().min(16).max(200) })
export type InviteJoin = z.infer<typeof InviteJoin>

export const Member = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  role: SpaceRole,
  joinedAt: z.iso.datetime({ offset: true }),
})
export type Member = z.infer<typeof Member>

export const INVITE_DAYS = 7
