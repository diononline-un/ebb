import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../src/server/db.ts'
import { addDays } from '../src/shared/day.ts'
import type { ProjectProgress } from '../src/shared/schemas/projects.ts'
import { as, createUser, ownerSql, resetDb, type TestUser } from './harness.ts'

beforeEach(resetDb)
afterAll(async () => {
  await closeDb()
  await ownerSql.end()
})

async function todayOf(user: TestUser): Promise<string> {
  return ((await (await as(user).get('/api/today')).json()) as { date: string }).date
}

async function createProject(user: TestUser, body: Record<string, unknown> = {}): Promise<ProjectProgress> {
  const res = await as(user).post('/api/projects', { name: 'Move the office', ...body })
  expect(res.status).toBe(201)
  return (await res.json()) as ProjectProgress
}

async function createTask(user: TestUser, body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await as(user).post('/api/tasks', body)
  expect(res.status).toBe(201)
  return ((await res.json()) as { task: { id: string } }).task
}

describe('POST /api/projects', () => {
  it('creates a project in the personal space without progress yet', async () => {
    const user = await createUser()
    const created = await createProject(user)
    expect(created.project.name).toBe('Move the office')
    expect(created.project.status).toBe('active')
    expect(created.progress).toBeNull()
    expect(created.openCount).toBe(0)
  })

  it('hangs on a goal of the same person only', async () => {
    const a = await createUser()
    const b = await createUser()
    const goal = (await (await as(a).post('/api/goals', { title: 'Be calmer' })).json()) as { id: string }

    expect((await createProject(a, { goalId: goal.id })).project.goalId).toBe(goal.id)
    const foreign = await as(b).post('/api/projects', { name: 'Not mine', goalId: goal.id })
    expect(foreign.status).toBe(422)
    expect(((await foreign.json()) as { code: string }).code).toBe('unknown_goal')
  })

  it('refuses a deadline before the start', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const res = await as(user).post('/api/projects', {
      name: 'Backwards',
      startDate: today,
      deadline: addDays(today, -1),
    })
    expect(res.status).toBe(500)
  })
})

describe('progress and warnings', () => {
  it('counts done over everything but the skipped tasks', async () => {
    const user = await createUser()
    const created = await createProject(user)
    const projectId = created.project.id

    const first = await createTask(user, { title: 'Pack the boxes', projectId })
    await createTask(user, { title: 'Book the van', projectId })
    const skipped = await createTask(user, { title: 'Skip the attic', projectId })
    await as(user).patch(`/api/tasks/${first.id}`, { status: 'done' })
    await as(user).patch(`/api/tasks/${skipped.id}`, { status: 'skipped' })

    const list = (await (await as(user).get('/api/projects')).json()) as ProjectProgress[]
    expect(list).toHaveLength(1)
    expect(list[0]?.progress).toBe(0.5)
    expect(list[0]?.openCount).toBe(1)
  })

  it('warns about a deadline within three days and about a project without a next step', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const created = await createProject(user, { deadline: addDays(today, 2) })
    const projectId = created.project.id

    // An open task with no do date: no next step planned.
    await createTask(user, { title: 'Think about it', projectId, doDate: null })
    const warning = (await (await as(user).get('/api/projects')).json()) as ProjectProgress[]
    expect(warning[0]?.warnings).toEqual(['deadline_soon', 'no_next_step'])
  })

  it('stays quiet when the work is planned and done', async () => {
    const user = await createUser()
    const today = await todayOf(user)
    const created = await createProject(user, { deadline: addDays(today, 2) })
    const projectId = created.project.id
    const task = await createTask(user, { title: 'Pack the boxes', projectId })
    await as(user).patch(`/api/tasks/${task.id}`, { status: 'done' })

    const list = (await (await as(user).get('/api/projects')).json()) as ProjectProgress[]
    expect(list[0]?.warnings).toEqual([])
    expect(list[0]?.progress).toBe(1)
  })
})

describe('GET /api/projects/:id', () => {
  it('brings the tasks of the project', async () => {
    const user = await createUser()
    const created = await createProject(user)
    await createTask(user, { title: 'Pack the boxes', projectId: created.project.id })

    const detail = (await (await as(user).get(`/api/projects/${created.project.id}`)).json()) as {
      tasks: { title: string }[]
    }
    expect(detail.tasks.map((task) => task.title)).toEqual(['Pack the boxes'])
  })

  it('answers 404 for a project of someone else', async () => {
    const a = await createUser()
    const b = await createUser()
    const created = await createProject(a)
    expect((await as(b).get(`/api/projects/${created.project.id}`)).status).toBe(404)
  })
})

describe('PATCH und DELETE /api/projects/:id', () => {
  it('renames and pauses a project', async () => {
    const user = await createUser()
    const created = await createProject(user)
    const res = await as(user).patch(`/api/projects/${created.project.id}`, { name: 'Move the flat', status: 'paused' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ project: { name: 'Move the flat', status: 'paused' } })
  })

  it('keeps the tasks when the project goes away', async () => {
    const user = await createUser()
    const created = await createProject(user)
    const task = await createTask(user, { title: 'Pack the boxes', projectId: created.project.id })

    expect((await as(user).delete(`/api/projects/${created.project.id}`)).status).toBe(204)
    const detail = (await (await as(user).get(`/api/tasks/${task.id}`)).json()) as { task: { projectId: string | null } }
    expect(detail.task.projectId).toBeNull()
  })
})

describe('subtasks', () => {
  it('keeps one level and brings the x/y with the task', async () => {
    const user = await createUser()
    const parent = await createTask(user, { title: 'Move the office' })
    const first = await createTask(user, { title: 'Pack the boxes', parentId: parent.id })
    await createTask(user, { title: 'Book the van', parentId: parent.id })

    const detail = (await (await as(user).get(`/api/tasks/${parent.id}`)).json()) as {
      subtasks: { id: string }[]
      progress: { done: number; total: number } | null
    }
    expect(detail.subtasks).toHaveLength(2)
    expect(detail.progress).toEqual({ done: 0, total: 2 })

    await as(user).patch(`/api/tasks/${first.id}`, { status: 'done' })
    const after = (await (await as(user).get(`/api/tasks/${parent.id}`)).json()) as {
      progress: { done: number; total: number } | null
    }
    expect(after.progress).toEqual({ done: 1, total: 2 })
  })

  it('refuses a grandchild and a parent of someone else', async () => {
    const a = await createUser()
    const b = await createUser()
    const parent = await createTask(a, { title: 'Move the office' })
    const child = await createTask(a, { title: 'Pack the boxes', parentId: parent.id })

    const tooDeep = await as(a).post('/api/tasks', { title: 'Nested', parentId: child.id })
    expect(tooDeep.status).toBe(422)
    expect(((await tooDeep.json()) as { code: string }).code).toBe('subtask_too_deep')

    const foreign = await as(b).post('/api/tasks', { title: 'Borrowed', parentId: parent.id })
    expect(foreign.status).toBe(422)
    expect(((await foreign.json()) as { code: string }).code).toBe('unknown_parent')
  })
})
