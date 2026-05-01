import { config } from './config'
import { getAuthToken } from './amplify'
import type {
  HoaSummary, HoaDetail, AdminUserRecord,
  PlatformStats, MonitoringData, BillingOverview,
  AdminDashboardData, SubscriptionsData, ActivityData,
  HoaHealth, InviteCodeData,
} from '@/types/admin'

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Session expired. Please sign out and sign in again.')
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

// ── HOA Health ────────────────────────────────────────────────────────────────

export async function getHoaHealth(hoaId: string): Promise<HoaHealth> {
  return adminFetch<HoaHealth>(`/api/admin/hoas/${hoaId}/health`)
}

export async function getHoaInviteCode(hoaId: string): Promise<InviteCodeData | null> {
  return adminFetch<InviteCodeData | null>(`/api/admin/hoas/${hoaId}/invite-code`)
}

export async function rotateHoaInviteCode(hoaId: string): Promise<InviteCodeData> {
  return adminFetch<InviteCodeData>(`/api/admin/hoas/${hoaId}/invite-code`, { method: 'POST', body: '{}' })
}

export async function createHoaAdminUser(hoaId: string, data: {
  email: string; firstName: string; lastName: string; phone?: string
}): Promise<{ success: boolean }> {
  return adminFetch<{ success: boolean }>(`/api/admin/hoas/${hoaId}/admin-user`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function removeUserFromHoa(hoaId: string, ownerId: string): Promise<void> {
  return adminFetch<void>(`/api/admin/hoas/${hoaId}/users/${ownerId}`, { method: 'DELETE' })
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

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  return adminFetch<AdminDashboardData>('/api/admin/dashboard')
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export async function getSubscriptions(): Promise<SubscriptionsData> {
  return adminFetch<SubscriptionsData>('/api/admin/subscriptions')
}

export async function updateSubscriptionTier(hoaId: string, tier: string): Promise<void> {
  return adminFetch<void>(`/api/admin/subscriptions/${hoaId}`, {
    method: 'PATCH',
    body: JSON.stringify({ tier }),
  })
}

export async function extendTrial(hoaId: string, days: number): Promise<void> {
  return adminFetch<void>(`/api/admin/subscriptions/${hoaId}/extend-trial`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  })
}

// ── Activity ──────────────────────────────────────────────────────────────────

export async function getActivityLog(params?: { limit?: number; offset?: number }): Promise<ActivityData> {
  const qs = new URLSearchParams()
  if (params?.limit)  qs.set('limit',  String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const q = qs.toString() ? `?${qs}` : ''
  return adminFetch<ActivityData>(`/api/admin/activity${q}`)
}
