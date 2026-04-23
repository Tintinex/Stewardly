'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Plus, CheckCircle2, Circle, Trash2, Edit2, ChevronDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Task, TaskStatus, TaskPriority, User, CreateTaskPayload, UpdateTaskPayload } from '@/types'
import { clsx } from 'clsx'

type FilterTab = 'all' | TaskStatus

const priorityVariant: Record<TaskPriority, 'default' | 'warning' | 'danger'> = {
  low: 'default', medium: 'warning', high: 'danger',
}

const statusVariant: Record<TaskStatus, 'default' | 'info' | 'success'> = {
  todo: 'default', in_progress: 'info', done: 'success',
}

const statusLabel: Record<TaskStatus, string> = {
  todo: 'To Do', in_progress: 'In Progress', done: 'Done',
}

export default function TasksPage() {
  const { hoaId, isLoading: authLoading } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [residents, setResidents] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium')
  const [formAssigneeId, setFormAssigneeId] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const loadTasks = useCallback(async () => {
    if (!hoaId) return
    const [t, r] = await Promise.all([api.getTasks(hoaId), api.getResidents(hoaId)])
    setTasks(t)
    setResidents(r)
  }, [hoaId])

  useEffect(() => {
    if (authLoading) return
    loadTasks().finally(() => setIsLoading(false))
  }, [authLoading, loadTasks])

  const filteredTasks = tasks.filter(t => filter === 'all' || t.status === filter)

  const handleToggleDone = async (task: Task) => {
    if (!hoaId) return
    const newStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    const updated = await api.updateTask(hoaId, task.id, { status: newStatus })
    setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
  }

  const handleStatusChange = async (task: Task, status: TaskStatus) => {
    if (!hoaId) return
    const updated = await api.updateTask(hoaId, task.id, { status })
    setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
  }

  const handleDelete = async (taskId: string) => {
    if (!hoaId) return
    await api.deleteTask(hoaId, taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    if (expandedId === taskId) setExpandedId(null)
  }

  const resetForm = () => {
    setFormTitle('')
    setFormDescription('')
    setFormPriority('medium')
    setFormAssigneeId('')
    setFormDueDate('')
    setFormError(null)
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hoaId) return
    setFormError(null)
    setFormLoading(true)
    try {
      const payload: CreateTaskPayload = {
        title: formTitle,
        description: formDescription || undefined,
        priority: formPriority,
        assigneeId: formAssigneeId || undefined,
        dueDate: formDueDate || undefined,
      }
      const created = await api.createTask(hoaId, payload)
      setTasks(prev => [created, ...prev])
      setIsModalOpen(false)
      resetForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setFormLoading(false)
    }
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'todo', label: 'To Do' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'done', label: 'Done' },
  ]

  if (authLoading || isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">{tasks.filter(t => t.status !== 'done').length} open tasks</p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setIsModalOpen(true)}>
          New Task
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-gray-100 p-1 w-fit">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              filter === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {label}
            <span className={clsx(
              'ml-1.5 rounded-full px-1.5 py-0.5 text-xs',
              filter === key ? 'bg-teal text-white' : 'bg-gray-200 text-gray-600',
            )}>
              {key === 'all' ? tasks.length : tasks.filter(t => t.status === key).length}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8" />}
          title="No tasks here"
          description={filter === 'done' ? 'Complete some tasks to see them here.' : 'Create a task to get started.'}
          ctaLabel="New Task"
          onCta={() => setIsModalOpen(true)}
        />
      ) : (
        <div className="space-y-2">
          {filteredTasks.map(task => (
            <div
              key={task.id}
              className={clsx(
                'rounded-xl border bg-white transition-shadow',
                task.status === 'done' ? 'border-gray-100 opacity-75' : 'border-gray-200',
                expandedId === task.id ? 'shadow-md' : 'shadow-sm hover:shadow-md',
              )}
            >
              {/* Task row */}
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => handleToggleDone(task)}
                  className="shrink-0 text-gray-300 hover:text-teal transition-colors"
                  aria-label={task.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
                >
                  {task.status === 'done'
                    ? <CheckCircle2 className="h-5 w-5 text-teal" />
                    : <Circle className="h-5 w-5" />}
                </button>

                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => setExpandedId(id => id === task.id ? null : task.id)}
                >
                  <p className={clsx(
                    'text-sm font-medium text-gray-900',
                    task.status === 'done' && 'line-through text-gray-400',
                  )}>
                    {task.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    {task.assigneeName && <span>{task.assigneeName}</span>}
                    {task.dueDate && (
                      <span className="text-gray-400">
                        · Due {format(parseISO(task.dueDate), 'MMM d')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={priorityVariant[task.priority]}>
                    {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                  </Badge>
                  <div className="relative">
                    <select
                      value={task.status}
                      onChange={e => handleStatusChange(task, e.target.value as TaskStatus)}
                      onClick={e => e.stopPropagation()}
                      className="appearance-none rounded-md border border-gray-200 bg-gray-50 pl-2 pr-6 py-1 text-xs font-medium text-gray-700 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal cursor-pointer"
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
                  </div>
                  {task.assigneeName && (
                    <Avatar name={task.assigneeName} size="xs" className="hidden sm:flex" />
                  )}
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                    aria-label="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setExpandedId(id => id === task.id ? null : task.id)}
                    className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Expand task"
                  >
                    <ChevronDown className={clsx(
                      'h-4 w-4 transition-transform',
                      expandedId === task.id && 'rotate-180',
                    )} />
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === task.id && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                  {task.description && (
                    <p className="text-sm text-gray-600 mb-3">{task.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>Status: <strong>{statusLabel[task.status]}</strong></span>
                    <span>Priority: <strong>{task.priority}</strong></span>
                    {task.assigneeName && <span>Assignee: <strong>{task.assigneeName}</strong></span>}
                    {task.dueDate && <span>Due: <strong>{format(parseISO(task.dueDate), 'MMM d, yyyy')}</strong></span>}
                    <span>Created: <strong>{format(parseISO(task.createdAt), 'MMM d, yyyy')}</strong></span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Task Modal */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); resetForm() }} title="New Task">
        <form onSubmit={handleCreateTask} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          <Input
            label="Title"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            placeholder="What needs to be done?"
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Priority"
              value={formPriority}
              onChange={e => setFormPriority(e.target.value as TaskPriority)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
            <Select
              label="Assignee"
              value={formAssigneeId}
              onChange={e => setFormAssigneeId(e.target.value)}
              placeholder="Unassigned"
              options={residents.map(r => ({
                value: r.id,
                label: `${r.firstName} ${r.lastName}`,
              }))}
            />
          </div>
          <Input
            label="Due Date"
            type="date"
            value={formDueDate}
            onChange={e => setFormDueDate(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setIsModalOpen(false); resetForm() }}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={formLoading}>
              Create Task
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
