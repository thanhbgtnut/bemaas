import { useCallback, useEffect, useState } from 'react'
import { accessToken, relogin } from './auth'

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

// Gọi /api/v1 kèm access token. Lỗi nghiệp vụ trả về ApiError có `code` (mục 12).
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken() ?? ''}`)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }
  const res = await fetch('/api/v1' + path, { ...init, headers, body })
  if (res.status === 401) {
    await relogin()
    throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? 'ERROR', data?.message ?? res.statusText, data?.details)
  }
  return data as T
}

export function accessTokenHeader(): Record<string, string> {
  return { Authorization: `Bearer ${accessToken() ?? ''}` }
}

export async function apiText(path: string): Promise<string> {
  const res = await fetch('/api/v1' + path, { headers: accessTokenHeader() })
  if (!res.ok) throw new ApiError(res.status, 'ERROR', res.statusText)
  return res.text()
}

// useApi tải dữ liệu khi path đổi; path null thì không tải.
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>()
  const [error, setError] = useState<ApiError | undefined>()
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (path === null) return
    let cancelled = false
    setLoading(true)
    api<T>(path)
      .then((d) => { if (!cancelled) { setData(d); setError(undefined) } })
      .catch((e) => { if (!cancelled) setError(e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path, tick])

  return { data, error, loading, reload }
}

// --- Kiểu dữ liệu trả về từ backend ---------------------------------------

export type Me = {
  id: string; email: string; name: string
  is_platform_admin: boolean; is_auditor: boolean
  admin_of: string[]; member_of: string[]
}

export type Price = { provider_id: string; input: string; output: string; cache_read: string; per_page: string }

export type Model = {
  id: string; name: string; provider_team: string; type: 'chat' | 'embedding' | 'rerank' | 'document'
  // standard: id chuẩn API (GET /standards); modes: các thao tác của chuẩn mà model hỗ trợ; unit: đơn vị tính giá
  standard: string; unit: 'token' | 'page'; modes: string[]; use_cases: string[]; status: 'production' | 'beta'; data_level: 'noi_bo' | 'mat'
  deploy: string; endpoint: string; context_length: number | null; enabled: boolean
  description: string; card?: string
  price: Price | null; calls_30d: number; likes: number; liked_by_me: boolean
}

export type UserRef = { id: string; email: string; name: string }

export type Department = {
  id: string; name: string; block: string; monthly_budget_usd: string; status: string
  used_usd: string; allocated_usd: string; unallocated_usd: string; key_count: number
  admins: UserRef[]; created_at: string
}

export type Key = {
  id: string; department_id: string; department_name: string; kind: 'member' | 'app'
  owner: UserRef | null; name: string; last4: string | null
  monthly_limit_usd: string; used_usd: string; allowed_models: string[]
  expires_at: string | null; status: 'pending' | 'active' | 'blocked_key' | 'blocked_dept' | 'revoked' | 'expired'
  created_at: string; claimed_at: string | null; last_used_at: string | null
}

export type Skill = {
  id: string; domain: string; name: string; title: string; kind: 'guide' | 'script' | 'tool'
  description: string; trigger: string; author: UserRef; owner_unit: string
  models: string[]; tools: string[]; verified: boolean; latest_version: string
  installs: number; likes: number; liked_by_me: boolean; created_at: string; updated_at: string
}

export type UsageRow = {
  group: string; label: string; requests: number; input_tokens: number; cache_tokens: number
  output_tokens: number; pages: number; cost_usd: string
}
