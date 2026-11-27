// E9-P6 load test: the mixed traffic of ~100 req/s against a running development server
// (docs/betrieb.md, "Lasttest"). No load tool, no dependency: fixed rate on top of Node's fetch.
// Run: node scripts/load/scenario.ts [--rate 100] [--duration 120] [--concurrency 50]
//      [--base http://127.0.0.1:2050] [--sessions /tmp/ebb-load-sessions.json]
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

// Where a person's requests go, straight from the capacity estimate in the package, in percent.
const MIX = [
  { name: 'GET /api/today', weight: 50 },
  { name: 'PATCH /api/tasks/:id', weight: 15 },
  { name: 'POST /api/dump', weight: 10 },
  { name: 'GET /api/tasks?view=week', weight: 10 },
  { name: 'GET /api/habits/today', weight: 10 },
  { name: 'POST /api/tasks', weight: 5 },
] as const

type RouteName = (typeof MIX)[number]['name']

type Sample = { route: RouteName; status: number; ms: number }
type TaskRef = { id: string }
type TodayBody = { anchor: TaskRef | null; must: TaskRef[]; slots: Record<string, TaskRef[]>; doneToday: TaskRef[] }
type WeekBody = { groups: { tasks: TaskRef[] }[] }

/** One virtual person: their session cookie and what they already know about their day. */
type Person = { cookie: string; taskIds: string[]; cursor: number; status: 'todo' | 'done' }

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback)
}

const rate = Number(arg('rate', '100'))
const duration = Number(arg('duration', '120'))
const concurrency = Number(arg('concurrency', '50'))
const base = arg('base', 'http://127.0.0.1:2050')
const sessionsFile = arg('sessions', '/tmp/ebb-load-sessions.json')

if (!(rate > 0) || !(duration > 0) || !(concurrency > 0)) throw new Error('--rate, --duration and --concurrency need positive numbers')
// The package forbids any target but the local development server.
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(base)) {
  throw new Error(`--base must be http://127.0.0.1:<port> or http://localhost:<port>, got "${base}"`)
}

const cookies = JSON.parse(await readFile(sessionsFile, 'utf8')) as string[]
if (cookies.length === 0) throw new Error(`${sessionsFile} has no sessions; run scripts/load/seed.ts first`)
const people: Person[] = cookies.map((cookie) => ({ cookie, taskIds: [], cursor: 0, status: 'todo' }))

const totalWeight = MIX.reduce((sum, entry) => sum + entry.weight, 0)
function pickRoute(): RouteName {
  let roll = Math.random() * totalWeight
  for (const entry of MIX) {
    roll -= entry.weight
    if (roll < 0) return entry.name
  }
  return MIX[MIX.length - 1]?.name ?? 'GET /api/today'
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const samples: Sample[] = []

/** Sends one request and records status and duration; a failed request counts as status 0. */
async function measured(
  route: RouteName,
  call: () => Promise<{ status: number; text: string }>,
): Promise<string> {
  const started = performance.now()
  let result = { status: 0, text: '' }
  try {
    result = await call()
  } catch {
    // Connection refused or reset: kept as status 0, which the report counts as an error.
  }
  samples.push({ route, status: result.status, ms: performance.now() - started })
  return result.text
}

async function send(method: string, path: string, person: Person, body?: unknown): Promise<{ status: number; text: string }> {
  const response = await fetch(base + path, {
    method,
    headers: body === undefined ? { cookie: person.cookie } : { cookie: person.cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, text: await response.text() }
}

/** Remembers the tasks of a today view; a person only PATCHes what they have seen. */
function learnFromToday(person: Person, text: string): void {
  if (person.taskIds.length >= 50) return
  try {
    const view = JSON.parse(text) as TodayBody
    const tasks = [view.anchor, ...view.must, ...Object.values(view.slots).flat(), ...view.doneToday]
    for (const task of tasks) {
      if (task && person.taskIds.length < 50 && !person.taskIds.includes(task.id)) person.taskIds.push(task.id)
    }
  } catch {
    // A failed request has no body to remember.
  }
}

function learnFromWeek(person: Person, text: string): void {
  if (person.taskIds.length >= 50) return
  try {
    const view = JSON.parse(text) as WeekBody
    for (const group of view.groups) {
      for (const task of group.tasks) {
        if (person.taskIds.length < 50 && !person.taskIds.includes(task.id)) person.taskIds.push(task.id)
      }
    }
  } catch {
    // A failed request has no body to remember.
  }
}

async function today(person: Person): Promise<void> {
  learnFromToday(person, await measured('GET /api/today', () => send('GET', '/api/today', person)))
}

function nextTaskId(person: Person): string | undefined {
  if (person.taskIds.length === 0) return undefined
  const id = person.taskIds[person.cursor % person.taskIds.length]
  person.cursor += 1
  return id
}

async function one(person: Person, index: number): Promise<void> {
  const route = pickRoute()
  switch (route) {
    case 'GET /api/today':
      await today(person)
      return
    case 'GET /api/tasks?view=week': {
      learnFromWeek(person, await measured(route, () => send('GET', '/api/tasks?view=week', person)))
      return
    }
    case 'PATCH /api/tasks/:id': {
      const id = nextTaskId(person)
      if (!id) {
        // Nothing seen yet: reading the day is what a person would do first.
        await today(person)
        return
      }
      person.status = person.status === 'todo' ? 'done' : 'todo'
      await measured(route, () => send('PATCH', `/api/tasks/${id}`, person, { status: person.status }))
      return
    }
    case 'POST /api/dump':
      await measured(route, () => send('POST', '/api/dump', person, { clientId: randomUUID(), text: `load ${index}` }))
      return
    case 'GET /api/habits/today':
      await measured(route, () => send('GET', '/api/habits/today', person))
      return
    case 'POST /api/tasks':
      await measured(route, () => send('POST', '/api/tasks', person, { title: `Load ${index}` }))
      return
  }
}

/** Nearest-rank percentile in whole milliseconds. */
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0)
}

function summary(route: RouteName | 'total', rows: Sample[]) {
  const durations = rows.map((row) => row.ms).sort((a, b) => a - b)
  return {
    route,
    requests: rows.length,
    // Nothing in this mix is an expected error: every 4xx/5xx and every failed connection counts.
    errors: rows.filter((row) => row.status === 0 || row.status >= 400).length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
  }
}

const startedAt = performance.now()
const total = Math.round(rate * duration)
let next = 0

// Fixed rate: slot `index` is due at index/rate seconds, and only `concurrency` workers are awake to
// take it. Running behind lowers the achieved rate, never the concurrency.
const workers = Array.from({ length: concurrency }, async () => {
  for (;;) {
    const index = next
    next += 1
    if (index >= total) return
    const due = startedAt + (index * 1000) / rate
    const wait = due - performance.now()
    if (wait > 0) await sleep(wait)
    const person = people[index % people.length]
    if (person) await one(person, index)
  }
})
await Promise.all(workers)

const elapsedSeconds = (performance.now() - startedAt) / 1000
const routes = [...new Set(samples.map((sample) => sample.route))]
const perRoute = routes.map((route) => summary(route, samples.filter((sample) => sample.route === route)))
const overall = summary('total', samples)

const report = {
  base,
  rate,
  duration,
  concurrency,
  sessions: people.length,
  requests: overall.requests,
  errors: overall.errors,
  achievedRate: Math.round((overall.requests / elapsedSeconds) * 10) / 10,
  p50: overall.p50,
  p95: overall.p95,
  p99: overall.p99,
  routes: Object.fromEntries(
    perRoute.map((row) => [row.route, { requests: row.requests, errors: row.errors, p50: row.p50, p95: row.p95, p99: row.p99 }]),
  ),
}
console.log(JSON.stringify(report))

const header = ['route', 'requests', 'errors', 'p50', 'p95', 'p99']
console.log(`${header[0]?.padEnd(28)}${header.slice(1).map((cell) => cell.padStart(10)).join('')}`)
for (const row of [...perRoute, overall]) {
  const cells = [String(row.requests), String(row.errors), `${row.p50} ms`, `${row.p95} ms`, `${row.p99} ms`]
  console.log(`${row.route.padEnd(28)}${cells.map((cell) => cell.padStart(10)).join('')}`)
}
