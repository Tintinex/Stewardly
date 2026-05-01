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

export interface BudgetWithLineItems {
  id: string
  hoaId: string
  fiscalYear: number
  totalAmount: number
  approvedAt: string | null
  createdAt: string
  lineItems: BudgetLineItem[]
}

export interface Account {
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

export interface FinancialSummary {
  totalBudget: number
  ytdExpenses: number
  ytdIncome: number
  reserveFundBalance: number
  lineItems: BudgetLineItem[]
  expenseTrend: Array<{ month: string; amount: number; income: number }>
  expenseBreakdown: Array<{ category: string; amount: number; color: string }>
  accounts: Account[]
  recentTransactions: Transaction[]
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

export interface TransactionFilters {
  startDate?: string
  endDate?: string
  category?: string
  type?: 'debit' | 'credit'
  search?: string
  accountId?: string
  limit?: number
  offset?: number
}

export interface CreateBudgetInput {
  fiscalYear: number
  lineItems: Array<{ category: string; description?: string; budgetedAmount: number }>
}

export interface CreateTransactionInput {
  accountId: string
  amount: number
  description: string
  vendor?: string
  category: string
  date: string
  type: 'debit' | 'credit'
  notes?: string
}

export interface CreateAccountInput {
  accountName: string
  institutionName: string
  accountType: string
  balance: number
  currency?: string
}

export interface CreateAssessmentInput {
  unitId: string
  amount: number
  description: string
  dueDate: string
  notes?: string
}

// ── Plaid ──────────────────────────────────────────────────────────────────────

export interface PlaidItemRecord {
  id: string
  hoaId: string
  itemId: string
  accessToken: string
  institutionId: string
  institutionName: string
  cursor: string | null
  status: 'active' | 'error' | 'item_login_required'
  errorCode: string | null
  lastSyncedAt: string | null
  createdAt: string
}

export interface PlaidItemPublic {
  id: string
  institutionName: string
  status: 'active' | 'error' | 'item_login_required'
  errorCode: string | null
  lastSyncedAt: string | null
  accountCount: number
}

export interface PlaidSyncResult {
  itemId: string
  added: number
  modified: number
  removed: number
}
