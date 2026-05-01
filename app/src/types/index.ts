// ─── Core Entities ────────────────────────────────────────────────────────────

export interface HOA {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  unitCount: number
  timezone: string
  subscriptionTier: 'starter' | 'growth' | 'enterprise'
  createdAt: string
  updatedAt: string
}

export interface Unit {
  id: string
  hoaId: string
  unitNumber: string
  address: string
  sqft: number | null
  bedrooms: number | null
  bathrooms: number | null
  createdAt: string
  updatedAt: string
}

export type UserRole = 'board_admin' | 'board_member' | 'homeowner' | 'superadmin'

export interface User {
  id: string
  hoaId: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  unitId: string | null
  unitNumber: string | null
  phone: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  hoaId: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeId: string | null
  assigneeName: string | null
  dueDate: string | null
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface TaskComment {
  id: string
  taskId: string
  hoaId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled'

export interface Meeting {
  id: string
  hoaId: string
  title: string
  scheduledAt: string
  location: string | null
  status: MeetingStatus
  agendaItems: AgendaItem[]
  minutes: string | null
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface AgendaItem {
  id: string
  order: number
  title: string
  duration: number | null
}

export interface ActionItem {
  id: string
  meetingId: string
  hoaId: string
  title: string
  assigneeId: string | null
  assigneeName: string | null
  dueDate: string | null
  completed: boolean
  linkedTaskId: string | null
  createdAt: string
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export type BoardVisibility = 'community_wide' | 'board_only'

export interface Board {
  id: string
  hoaId: string
  name: string
  description: string | null
  visibility: BoardVisibility
  threadCount: number
  createdAt: string
}

export interface Thread {
  id: string
  boardId: string
  hoaId: string
  title: string
  authorId: string
  authorName: string
  pinned: boolean
  postCount: number
  lastPostAt: string
  createdAt: string
}

export interface Post {
  id: string
  threadId: string
  hoaId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
}

// ─── Finances ─────────────────────────────────────────────────────────────────

export interface Budget {
  id: string
  hoaId: string
  fiscalYear: number
  totalAmount: number
  approvedAt: string | null
  createdAt: string
}

export interface BudgetLineItem {
  id: string
  budgetId: string
  hoaId: string
  category: string
  description: string
  budgetedAmount: number
  actualAmount: number
  variance: number
}

export interface BudgetWithLineItems extends Budget {
  lineItems: BudgetLineItem[]
}

export interface Assessment {
  id: string
  hoaId: string
  unitId: string
  unitNumber: string
  ownerName: string | null
  amount: number
  description: string
  dueDate: string
  paidDate: string | null
  status: 'pending' | 'paid' | 'overdue'
  notes: string | null
  createdAt: string
}

export interface Transaction {
  id: string
  accountId: string
  accountName?: string
  amount: number
  description: string
  vendor: string | null
  category: string
  date: string
  type: 'debit' | 'credit'
  notes: string | null
  isManual: boolean
  createdAt: string
}

export interface FinanceAccount {
  id: string
  institutionName: string
  accountName: string
  accountType: string
  balance: number
  currency: string
  lastSyncedAt: string
  plaidItemId: string | null
  plaidAccountId: string | null
}

export interface PlaidItem {
  id: string
  institutionName: string
  status: 'active' | 'error' | 'item_login_required'
  errorCode: string | null
  lastSyncedAt: string | null
  accountCount: number
}

export interface AnalyticsData {
  monthlyTrend: Array<{ month: string; expenses: number; income: number; budget: number }>
  categoryBreakdown: Array<{ category: string; amount: number; budgeted: number; percent: number; color: string }>
  cashFlow: { totalIncome: number; totalExpenses: number; netCashFlow: number; avgMonthlyExpenses: number }
  assessmentSummary: { totalExpected: number; totalCollected: number; outstanding: number; overdueCount: number; collectionRate: number }
  insights: Array<{ type: 'warning' | 'success' | 'info'; title: string; message: string }>
  topVendors: Array<{ vendor: string; amount: number; count: number }>
  budgetUtilization: number
}

// ─── Aggregated / API Response Types ─────────────────────────────────────────

export interface DashboardSummary {
  hoaName: string
  totalUnits: number
  duesCollectedPercent: number
  duesCollectedAmount: number
  totalDuesAmount: number
  openTasksCount: number
  reserveFundBalance: number
  recentTasks: Task[]
  upcomingMeetings: Meeting[]
  recentPosts: RecentPost[]
  expenseTrend: MonthlyExpense[]
  expenseBreakdown: ExpenseCategory[]
}

export interface RecentPost {
  id: string
  boardName: string
  threadTitle: string
  authorName: string
  body: string
  createdAt: string
}

export interface MonthlyExpense {
  month: string
  amount: number
  budget: number
}

export interface ExpenseCategory {
  category: string
  amount: number
  color: string
}

export interface Financials {
  totalBudget: number
  ytdExpenses: number
  ytdIncome: number
  reserveFundBalance: number
  lineItems: BudgetLineItem[]
  expenseTrend: Array<{ month: string; amount: number; income: number }>
  expenseBreakdown: ExpenseCategory[]
  accounts: FinanceAccount[]
  recentTransactions: Transaction[]
}

// ─── Resident Portal ─────────────────────────────────────────────────────────

export interface MyUnitData {
  owner: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
    role: string
    unitId: string | null
  }
  unit: {
    id: string
    unitNumber: string
    address: string
    sqft: number | null
    bedrooms: number | null
    bathrooms: number | null
  } | null
  assessments: Assessment[]
  hoaName: string
  hoaAddress: string
  hoaCity: string
  hoaState: string
  hoaZip: string
}

export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type MaintenancePriority = 'low' | 'normal' | 'urgent'
export type MaintenanceCategory =
  | 'plumbing' | 'electrical' | 'hvac' | 'structural'
  | 'landscaping' | 'pest_control' | 'common_area' | 'other'

export interface MaintenanceRequest {
  id: string
  hoaId: string
  unitId: string
  unitNumber: string
  submittedByName: string | null
  title: string
  description: string | null
  category: MaintenanceCategory
  priority: MaintenancePriority
  status: MaintenanceStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateMaintenancePayload {
  title: string
  description?: string
  category: MaintenanceCategory
  priority?: MaintenancePriority
}

export interface DocumentRecord {
  id: string
  hoaId: string
  title: string
  description: string | null
  category: 'general' | 'financial' | 'legal' | 'meeting_minutes' | 'rules' | 'forms'
  fileUrl: string
  fileName: string
  fileSizeBytes: number | null
  uploadedByName: string | null
  createdAt: string
}

export interface InviteCodeInfo {
  code: string
  usedCount: number
  expiresAt: string | null
  isActive: boolean
}

// ─── HOA Admin Portal ─────────────────────────────────────────────────────────

export type MemberStatus = 'pending' | 'active' | 'suspended'

export interface Member {
  id: string
  hoaId: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  status: MemberStatus
  unitId: string | null
  unitNumber: string | null
  phone: string | null
  lastSeenAt: string | null
  joinedViaCode: string | null
  createdAt: string
  updatedAt: string
}

export interface HoaStats {
  totalMembers: number
  activeMembers: number
  pendingMembers: number
  suspendedMembers: number
  totalUnits: number
  occupiedUnits: number
  openMaintenanceRequests: number
  urgentMaintenanceRequests: number
  overdueAssessments: number
  recentActivityCount: number
}

export interface HoaInviteCode {
  id: string
  hoaId: string
  code: string
  usedCount: number
  maxUses: number | null
  expiresAt: string | null
  isActive: boolean
  createdAt: string
}

export interface ActivityEntry {
  id: string
  hoaId: string
  ownerId: string | null
  actorName: string
  action: string
  metadata: Record<string, unknown> | null
  createdAt: string
}


// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  hoaId: string
  hoaName: string
  role: UserRole
  unitId: string | null
  avatarUrl: string | null  // presigned S3 GET URL, valid ~1 hour
}

// ─── API Request Payloads ─────────────────────────────────────────────────────

export interface CreateTaskPayload {
  title: string
  description?: string
  priority: TaskPriority
  assigneeId?: string
  dueDate?: string
}

export interface UpdateTaskPayload {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId?: string
  dueDate?: string
}

export interface CreateMeetingPayload {
  title: string
  scheduledAt: string
  location?: string
  agendaItems?: Omit<AgendaItem, 'id'>[]
}

export interface CreateResidentPayload {
  firstName: string
  lastName: string
  email: string
  phone?: string
  role: UserRole
  unitNumber: string
}

export interface CreatePostPayload {
  body: string
}

export interface CreateThreadPayload {
  title: string
  boardId: string
  body: string
}

// ─── HOA Registration ─────────────────────────────────────────────────────────

export interface RegisterHoaPayload {
  hoaName: string
  address?: string
  city?: string
  state?: string
  zip?: string
  unitCount?: number
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
}

export interface RegisterHoaResult {
  hoa: { id: string; name: string }
  owner: { id: string; email: string; firstName: string; lastName: string; role: string }
  inviteCode: string
  message: string
}
