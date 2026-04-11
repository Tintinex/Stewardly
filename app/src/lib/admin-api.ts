import { config } from './config'
import { getAuthToken } from './amplify'
import type {
  HoaSummary, HoaDetail, AdminUserRecord,
  PlatformStats, MonitoringData, BillingOverview,
} from '@/types/admin'

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken()
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `Admin API error ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── HOA Management ────────────────────────────────────────────────────────────

export async function getHoas(): Promise<HoaSummary[]> {
  return adminFetch<HoaSummary[]>('/api/admin/hoas')
}

export async function getHoa(hoaId: string): Promise<HoaDetail> {
  return adminFetch<HoaDetail>(`/api/admin/hoas/${hoaId}`)
}

export async function updateHoa(hoaId: string, input: { name?: string; subscriptionTier?: string }): Promise<HoaDetail> {
  return adminFetch<HoaDetail>(`/api/admin/hoas/${hoaId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

// ── User Management ───────────────────────────────────────────────────────────

export async function getAdminUsers(hoaId?: string): Promise<AdminUserRecord[]> {
  const qs = hoaId ? `?hoaId=${hoaId}` : ''
  return adminFetch<AdminUserRecord[]>(`/api/admin/users${qs}`)
}

export async function disableUser(cognitoUsername: string): Promise<void> {
  return adminFetch<void>(`/api/admin/users/${cognitoUsername}/disable`, { method: 'POST' })
}

export async function enableUser(cognitoUsername: string): Promise<void> {
  return adminFetch<void>(`/api/admin/users/${cognitoUsername}/enable`, { method: 'POST' })
}

export async function resetUserPassword(cognitoUsername: string): Promise<void> {
  return adminFetch<void>(`/api/admin/users/${cognitoUsername}/reset-password`, { method: 'POST' })
}

export async function updateUserRole(cognitoUsername: string, role: string): Promise<void> {
  return adminFetch<void>(`/api/admin/users/${cognitoUsername}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

// ── Stats & Monitoring ────────────────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  return adminFetch<PlatformStats>('/api/admin/stats')
}

export async function getMonitoringMetrics(): Promise<MonitoringData> {
  return adminFetch<MonitoringData>('/api/admin/monitoring')
}

export async function getBillingOverview(): Promise<BillingOverview> {
  return adminFetch<BillingOverview>('/api/admin/billing')
}
