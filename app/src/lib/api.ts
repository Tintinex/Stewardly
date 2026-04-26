import { config } from './config'
import { getAuthToken, amplifySignIn, amplifySignOut, fetchAuthSession } from './amplify'
import {
  mockResidents, mockTasks, mockMeetings, mockBoards,
  mockThreads, mockPosts, mockDashboardSummary, mockFinancials,
} from './mock-data'
import type {
  User, Task, Meeting, Board, Thread, Post, DashboardSummary,
  Financials, AuthUser, CreateTaskPayload, UpdateTaskPayload,
  CreateMeetingPayload, CreateResidentPayload, CreatePostPayload,
  MyUnitData, MaintenanceRequest, CreateMaintenancePayload, DocumentRecord,
  HoaStats, Member, HoaInviteCode, ActivityEntry,
  RegisterHoaPayload, RegisterHoaResult,
} from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function uuid(): string {
  return crypto.randomUUID()
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    throw new Error(err.message || `API error ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<AuthUser> {
  if (config.useMock) {
    await delay(200)
    const u = mockResidents[0]
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      hoaId: u.hoaId,
      role: u.role,
      unitId: u.unitId,
    }
  }

  // Read identity directly from the Cognito JWT — no backend call needed.
  // The access token carries custom:hoaId, custom:role, sub, and email.
  const session = await fetchAuthSession()
  const token = session.tokens?.accessToken
  if (!token) throw new Error('No active session')

  // Amplify v6 exposes the decoded payload on the token object
  const payload = token.payload as Record<string, string>

  return {
    id: payload['sub'] ?? '',
    email: payload['email'] ?? payload['username'] ?? '',
    firstName: payload['given_name'] ?? '',
    lastName: payload['family_name'] ?? '',
    hoaId: payload['custom:hoaId'] ?? '',
    role: (payload['custom:role'] ?? 'homeowner') as AuthUser['role'],
    unitId: payload['custom:unitId'] ?? null,
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  if (config.useMock) {
    await delay(300)
    if (email && password) return
    throw new Error('Email and password are required')
  }

  // Clear any stale session so we never hit "There is already a signed in user"
  try { await amplifySignOut() } catch { /* no session — that's fine */ }

  const result = await amplifySignIn({ username: email, password })
  if (!result.isSignedIn) {
    const step = result.nextStep?.signInStep ?? 'UNKNOWN'
    if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      throw new Error('Your account requires a password reset. Please contact support.')
    }
    throw new Error(`Sign-in requires an additional step: ${step}`)
  }
}

export async function signOut(): Promise<void> {
  if (config.useMock) {
    await delay(100)
    return
  }
  await amplifySignOut()
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboard(_hoaId: string): Promise<DashboardSummary> {
  if (config.useMock) {
    await delay(200)
    return mockDashboardSummary
  }
  return apiFetch<DashboardSummary>('/api/dashboard')
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

const taskStore: Task[] = [...mockTasks]

export async function getTasks(_hoaId: string): Promise<Task[]> {
  if (config.useMock) {
    await delay(200)
    return [...taskStore]
  }
  return apiFetch<Task[]>('/api/tasks')
}

export async function createTask(_hoaId: string, payload: CreateTaskPayload): Promise<Task> {
  if (config.useMock) {
    await delay(200)
    const task: Task = {
      id: `task-${uuid()}`,
      hoaId: _hoaId,
      title: payload.title,
      description: payload.description ?? null,
      status: 'todo',
      priority: payload.priority,
      assigneeId: payload.assigneeId ?? null,
      assigneeName: payload.assigneeId
        ? (mockResidents.find(r => r.id === payload.assigneeId)?.firstName ?? '') +
          ' ' +
          (mockResidents.find(r => r.id === payload.assigneeId)?.lastName ?? '')
        : null,
      dueDate: payload.dueDate ?? null,
      createdById: mockResidents[0].id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    taskStore.push(task)
    return task
  }
  return apiFetch<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateTask(
  _hoaId: string,
  taskId: string,
  updates: UpdateTaskPayload,
): Promise<Task> {
  if (config.useMock) {
    await delay(200)
    const idx = taskStore.findIndex(t => t.id === taskId)
    if (idx === -1) throw new Error('Task not found')
    const updated = { ...taskStore[idx], ...updates, updatedAt: new Date().toISOString() }
    if (updates.assigneeId) {
      const assignee = mockResidents.find(r => r.id === updates.assigneeId)
      updated.assigneeName = assignee ? `${assignee.firstName} ${assignee.lastName}` : null
    }
    taskStore[idx] = updated
    return updated
  }
  return apiFetch<Task>(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function deleteTask(_hoaId: string, taskId: string): Promise<void> {
  if (config.useMock) {
    await delay(200)
    const idx = taskStore.findIndex(t => t.id === taskId)
    if (idx !== -1) taskStore.splice(idx, 1)
    return
  }
  return apiFetch<void>(`/api/tasks/${taskId}`, { method: 'DELETE' })
}

// ─── Meetings ─────────────────────────────────────────────────────────────────

const meetingStore: Meeting[] = [...mockMeetings]

export async function getMeetings(_hoaId: string): Promise<Meeting[]> {
  if (config.useMock) {
    await delay(200)
    return [...meetingStore]
  }
  return apiFetch<Meeting[]>('/api/meetings')
}

export async function getMeetingById(_hoaId: string, meetingId: string): Promise<Meeting> {
  if (config.useMock) {
    await delay(200)
    const m = meetingStore.find(m => m.id === meetingId)
    if (!m) throw new Error('Meeting not found')
    return m
  }
  return apiFetch<Meeting>(`/api/meetings/${meetingId}`)
}

export async function createMeeting(_hoaId: string, payload: CreateMeetingPayload): Promise<Meeting> {
  if (config.useMock) {
    await delay(200)
    const meeting: Meeting = {
      id: `meeting-${uuid()}`,
      hoaId: _hoaId,
      title: payload.title,
      scheduledAt: payload.scheduledAt,
      location: payload.location ?? null,
      status: 'scheduled',
      agendaItems: (payload.agendaItems ?? []).map((ai, i) => ({ ...ai, id: `ai-${uuid()}-${i}` })),
      minutes: null,
      createdById: mockResidents[0].id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    meetingStore.push(meeting)
    return meeting
  }
  return apiFetch<Meeting>('/api/meetings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ─── Residents ────────────────────────────────────────────────────────────────

const residentStore: User[] = [...mockResidents]

export async function getResidents(_hoaId: string): Promise<User[]> {
  if (config.useMock) {
    await delay(200)
    return [...residentStore]
  }
  return apiFetch<User[]>('/api/residents')
}

export async function createResident(_hoaId: string, payload: CreateResidentPayload): Promise<User> {
  if (config.useMock) {
    await delay(200)
    const resident: User = {
      id: `user-${uuid()}`,
      hoaId: _hoaId,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      role: payload.role,
      unitId: null,
      unitNumber: payload.unitNumber,
      phone: payload.phone ?? null,
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    residentStore.push(resident)
    return resident
  }
  return apiFetch<User>('/api/residents', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateResident(
  _hoaId: string,
  residentId: string,
  updates: Partial<CreateResidentPayload>,
): Promise<User> {
  if (config.useMock) {
    await delay(200)
    const idx = residentStore.findIndex(r => r.id === residentId)
    if (idx === -1) throw new Error('Resident not found')
    const updated = { ...residentStore[idx], ...updates, updatedAt: new Date().toISOString() }
    residentStore[idx] = updated
    return updated
  }
  return apiFetch<User>(`/api/residents/${residentId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getBoards(_hoaId: string): Promise<Board[]> {
  if (config.useMock) {
    await delay(200)
    return mockBoards
  }
  return apiFetch<Board[]>('/api/boards')
}

export async function getThreads(_hoaId: string, boardId: string): Promise<Thread[]> {
  if (config.useMock) {
    await delay(200)
    return mockThreads.filter(t => t.boardId === boardId)
  }
  return apiFetch<Thread[]>(`/api/boards/${boardId}/threads`)
}

const postStore: Post[] = [...mockPosts]

export async function getPosts(_hoaId: string, threadId: string): Promise<Post[]> {
  if (config.useMock) {
    await delay(200)
    return postStore.filter(p => p.threadId === threadId)
  }
  return apiFetch<Post[]>(`/api/threads/${threadId}/posts`)
}

export async function createPost(
  _hoaId: string,
  threadId: string,
  payload: CreatePostPayload,
): Promise<Post> {
  if (config.useMock) {
    await delay(200)
    const user = mockResidents[0]
    const post: Post = {
      id: `post-${uuid()}`,
      threadId,
      hoaId: _hoaId,
      authorId: user.id,
      authorName: `${user.firstName} ${user.lastName}`,
      body: payload.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    postStore.push(post)
    return post
  }
  return apiFetch<Post>(`/api/threads/${threadId}/posts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ─── Finances ─────────────────────────────────────────────────────────────────

export async function getFinancials(_hoaId: string): Promise<Financials> {
  if (config.useMock) {
    await delay(200)
    return mockFinancials
  }
  return apiFetch<Financials>('/api/finances')
}

// ─── Resident portal ──────────────────────────────────────────────────────────

/** Validate an HOA invite code before sign-up (public — no auth token required) */
export async function validateInviteCode(code: string): Promise<{ valid: boolean; hoaName?: string; hoaId?: string; message?: string }> {
  if (config.useMock) {
    await delay(300)
    return { valid: true, hoaId: 'mock-hoa', hoaName: 'Mock HOA Community' }
  }
  const res = await fetch(`${config.apiUrl}/auth/validate-invite?code=${encodeURIComponent(code)}`)
  if (!res.ok) return { valid: false, message: 'Invite code check failed' }
  return res.json() as Promise<{ valid: boolean; hoaName?: string; hoaId?: string; message?: string }>
}

/** Called once after first sign-in to create the DB owner record from JWT claims */
export async function ensureOwner(payload: { firstName: string; lastName: string; email: string; phone?: string; unitNumber?: string }): Promise<AuthUser> {
  if (config.useMock) {
    await delay(200)
    return {} as AuthUser
  }
  return apiFetch<AuthUser>('/api/residents/me', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getMyUnit(): Promise<MyUnitData> {
  if (config.useMock) {
    await delay(200)
    return {
      unit: { id: 'u1', unitNumber: '101', address: '101 Oak Lane', sqft: 1200, bedrooms: 2, bathrooms: 2 },
      assessments: [],
      ownerName: 'Demo User',
      hoaName: 'Mock HOA',
    }
  }
  return apiFetch<MyUnitData>('/api/my-unit')
}

export async function getMaintenanceRequests(): Promise<MaintenanceRequest[]> {
  if (config.useMock) { await delay(200); return [] }
  return apiFetch<MaintenanceRequest[]>('/api/maintenance-requests')
}

export async function createMaintenanceRequest(payload: CreateMaintenancePayload): Promise<MaintenanceRequest> {
  if (config.useMock) { await delay(300); return {} as MaintenanceRequest }
  return apiFetch<MaintenanceRequest>('/api/maintenance-requests', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getDocuments(): Promise<DocumentRecord[]> {
  if (config.useMock) { await delay(200); return [] }
  return apiFetch<DocumentRecord[]>('/api/documents')
}

/** Create a thread in a board (first post included in body) */
export async function createThread(_hoaId: string, boardId: string, payload: { title: string; body: string }): Promise<Thread> {
  if (config.useMock) {
    await delay(300)
    return {
      id: `thread-${uuid()}`, boardId, hoaId: _hoaId,
      title: payload.title, authorId: 'me', authorName: 'You',
      pinned: false, postCount: 1, lastPostAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    }
  }
  return apiFetch<Thread>(`/api/boards/${boardId}/threads`, { method: 'POST', body: JSON.stringify(payload) })
}

// ─── HOA Admin — Members & Membership ─────────────────────────────────────────

export async function getHoaStats(): Promise<HoaStats> {
  if (config.useMock) {
    await delay(200)
    return { totalMembers: 24, activeMembers: 21, pendingMembers: 2, suspendedMembers: 1,
             totalUnits: 30, occupiedUnits: 24, openMaintenanceRequests: 3,
             urgentMaintenanceRequests: 1, overdueAssessments: 2, recentActivityCount: 14 }
  }
  return apiFetch<HoaStats>('/api/hoa/stats')
}

export async function getMembers(status?: 'pending' | 'active' | 'suspended'): Promise<Member[]> {
  if (config.useMock) { await delay(200); return [] }
  const qs = status ? `?status=${status}` : ''
  return apiFetch<Member[]>(`/api/hoa/members${qs}`)
}

export async function updateMemberStatus(memberId: string, status: 'active' | 'suspended', notes?: string): Promise<Member> {
  if (config.useMock) { await delay(300); return {} as Member }
  return apiFetch<Member>(`/api/hoa/members/${memberId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  })
}

export async function getHoaInviteCode(): Promise<HoaInviteCode | null> {
  if (config.useMock) {
    await delay(200)
    return { id: 'mock', hoaId: 'mock', code: 'SUNRISE8', usedCount: 3, maxUses: null, expiresAt: null, isActive: true, createdAt: new Date().toISOString() }
  }
  return apiFetch<HoaInviteCode | null>('/api/hoa/invite-code')
}

export async function rotateHoaInviteCode(opts?: { maxUses?: number; expiresInDays?: number }): Promise<HoaInviteCode> {
  if (config.useMock) { await delay(300); return {} as HoaInviteCode }
  return apiFetch<HoaInviteCode>('/api/hoa/invite-code', { method: 'POST', body: JSON.stringify(opts ?? {}) })
}

export async function getHoaActivityLog(limit = 50, offset = 0): Promise<ActivityEntry[]> {
  if (config.useMock) { await delay(200); return [] }
  return apiFetch<ActivityEntry[]>(`/api/hoa/activity?limit=${limit}&offset=${offset}`)
}

// ─── HOA self-registration (public — no auth token required) ─────────────────

export async function registerHoa(payload: RegisterHoaPayload): Promise<RegisterHoaResult> {
  if (config.useMock) {
    await delay(600)
    return {
      hoa: { id: 'mock-hoa-id', name: payload.hoaName },
      owner: { id: 'mock-owner-id', email: payload.email, firstName: payload.firstName, lastName: payload.lastName, role: 'board_admin' },
      inviteCode: 'MOCKCD12',
      message: `"${payload.hoaName}" is live on a 14-day free trial.`,
    }
  }
  const res = await fetch(`${config.apiUrl}/auth/register-hoa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `Registration failed (${res.status})`)
  }
  return res.json() as Promise<RegisterHoaResult>
}

// ─── Superadmin — HOA admin user creation ─────────────────────────────────────

export async function createHoaAdminUser(hoaId: string, payload: {
  email: string; firstName: string; lastName: string; phone?: string
}): Promise<{ owner: Member; temporaryPassword: string; hoaName: string }> {
  if (config.useMock) { await delay(400); return { owner: {} as Member, temporaryPassword: 'TempPass123!', hoaName: 'Mock HOA' } }
  return apiFetch(`/api/admin/hoas/${hoaId}/admin-user`, { method: 'POST', body: JSON.stringify(payload) })
}
