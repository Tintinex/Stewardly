export interface Task {
  id: string
  hoaId: string
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  assigneeId: string | null
  assigneeName: string | null
  dueDate: string | null
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high'
  assigneeId: string | null
  dueDate: string | null
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  status?: 'todo' | 'in_progress' | 'done'
  priority?: 'low' | 'medium' | 'high'
  assigneeId?: string | null
  dueDate?: string | null
}
