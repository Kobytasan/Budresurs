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
  if (!contentType.includes('application/json')) {
    const error = new Error(
      response.ok
        ? 'Сервер API повернув сторінку замість даних. Перевірте, що хостинг направляє /api/ до server.py.'
        : `Сервер API повернув HTTP ${response.status} без JSON-відповіді.`,
    ) as ApiError
    error.status = response.status
    throw error
  }

  const payload: unknown = await response.json()

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
