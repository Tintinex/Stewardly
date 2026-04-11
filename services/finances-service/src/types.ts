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

export interface Account {
  id: string
  institutionName: string
  accountName: string
  accountType: string
  balance: number
  currency: string
  lastSyncedAt: string
}

export interface Transaction {
  id: string
  accountId: string
  amount: number
  description: string
  category: string
  date: string
  type: 'debit' | 'credit'
}

export interface FinancialSummary {
  totalBudget: number
  ytdExpenses: number
  reserveFundBalance: number
  lineItems: BudgetLineItem[]
  expenseTrend: Array<{ month: string; amount: number }>
  expenseBreakdown: Array<{ category: string; amount: number; color: string }>
  accounts: Account[]
  recentTransactions: Transaction[]
}

export interface CreateBudgetInput {
  fiscalYear: number
  totalAmount: number
}
