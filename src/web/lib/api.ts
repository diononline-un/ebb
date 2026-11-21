export type ApiErrorFields = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: ApiErrorFields | undefined

  constructor(status: number, code: string, fields?: ApiErrorFields) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

// A single module-level store is enough: only writes are blocked, and every screen reads the same flag.
let readOnly = false
const listeners = new Set<() => void>()

export function setReadOnly(next: boolean): void {
  if (readOnly === next) return
  readOnly = next
  for (const listener of listeners) listener()
}

export function getReadOnly(): boolean {
  return readOnly
}

export function subscribeReadOnly(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { code?: string; fields?: ApiErrorFields }
    return new ApiError(response.status, body.code ?? 'request_failed', body.fields)
  } catch {
    return new ApiError(response.status, 'request_failed')
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, { ...init, headers, credentials: 'include' })

  if (response.status === 401) {
    // Hard navigation on purpose: the sign-in route arrives in E1-P7 and transport stays router-free.
    window.location.assign('/sign-in')
    throw new ApiError(401, 'unauthenticated')
  }

  if (response.status === 402) {
    setReadOnly(true)
    throw await toApiError(response)
  }

  if (!response.ok) throw await toApiError(response)

  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}
