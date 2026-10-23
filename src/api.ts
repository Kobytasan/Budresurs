import type { ApiError } from './types'

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json() as unknown
    : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String(payload.error)
        : 'Не вдалося виконати запит.'
    const error = new Error(message) as ApiError
    error.status = response.status
    throw error
  }
  return payload as T
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value)
}
