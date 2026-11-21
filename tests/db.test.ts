import { afterAll, describe, expect, it } from 'vitest'
import { appRoleSqlForTests, closeDb, withSystem, withUser } from '../src/server/db.ts'
import { ownerSql } from './harness.ts'

afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

describe('withUser', () => {
  it('exposes the user id through app.uid()', async () => {
    const [row] = await withUser('u1', (tx) => tx`select app.uid() as id`)
    expect(row?.['id']).toBe('u1')
  })

  it('keeps the setting transaction-local', async () => {
    await withUser('u1', (tx) => tx`select 1`)
    const sql = appRoleSqlForTests()
    const rows = await Promise.all(Array.from({ length: 12 }, () => sql`select app.uid() as id`))
    for (const [row] of rows) expect(row?.['id']).toBeNull()
  })

  it('runs as ebb_app', async () => {
    const [row] = await withUser('u1', (tx) => tx`select current_user as role`)
    expect(row?.['role']).toBe('ebb_app')
  })

  it('rejects an empty user id', async () => {
    await expect(withUser('', async () => 1)).rejects.toThrow('withUser needs a user id')
  })

  it('rolls back when fn throws', async () => {
    await expect(withUser('u1', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })
})

describe('roles', () => {
  it('only ebb_system bypasses RLS', async () => {
    const rows = await ownerSql<{ rolname: string; rolbypassrls: boolean }[]>`
      select rolname, rolbypassrls from pg_roles where rolname like 'ebb\\_%' order by rolname`
    expect(Object.fromEntries(rows.map((r) => [r.rolname, r.rolbypassrls]))).toEqual({
      ebb_app: false,
      ebb_auth: false,
      ebb_owner: false,
      ebb_system: true,
    })
  })

  it('withSystem runs as ebb_system', async () => {
    const [row] = await withSystem((tx) => tx`select current_user as role`)
    expect(row?.['role']).toBe('ebb_system')
  })

  it('the request role cannot create tables', async () => {
    await expect(appRoleSqlForTests().unsafe('create table nope (id int)')).rejects.toThrow(/permission denied/)
  })

  it('app.uid() is outside any user context NULL', async () => {
    const [row] = await appRoleSqlForTests()`select app.uid() as id`
    expect(row?.['id']).toBeNull()
  })
})
