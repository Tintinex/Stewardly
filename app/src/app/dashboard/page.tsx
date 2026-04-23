'use client'

import React, { useEffect, useState } from 'react'
import { Home, CheckSquare, DollarSign, TrendingUp, Calendar, MessageSquare } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '@/lib/api'
import { StatCard } from '@/components/dashboard/StatCard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import type { DashboardSummary, TaskStatus, TaskPriority } from '@/types'

function statusBadge(status: TaskStatus) {
  const map: Record<TaskStatus, { label: string; variant: 'default' | 'info' | 'success' }> = {
    todo:        { label: 'To Do',       variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'info' },
    done:        { label: 'Done',        variant: 'success' },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}

function priorityBadge(priority: TaskPriority) {
  const map: Record<TaskPriority, { label: string; variant: 'default' | 'warning' | 'danger' }> = {
    low:    { label: 'Low',    variant: 'default' },
    medium: { label: 'Medium', variant: 'warning' },
    high:   { label: 'High',   variant: 'danger' },
  }
  const { label, variant } = map[priority]
  return <Badge variant={variant}>{label}</Badge>
}

export default function DashboardPage() {
  const { hoaId, isLoading: authLoading } = useAuth()
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!hoaId) { setIsLoading(false); return }
    api.getDashboard(hoaId)
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [authLoading, hoaId])

  if (authLoading || isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!data) return null

  const duesFormatted = `$${(data.duesCollectedAmount / 1000).toFixed(1)}k / $${(data.totalDuesAmount / 1000).toFixed(1)}k`
  const reserveFormatted = `$${(data.reserveFundBalance / 1000).toFixed(0)}k`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{data.hoaName}</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {format(new Date(), 'EEEE, MMMM d, yyyy')} · Board Dashboard
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Home className="h-5 w-5" />}
          label="Total Units"
          value={data.totalUnits}
          variant="navy"
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Dues Collected"
          value={`${data.duesCollectedPercent}%`}
          trendDirection="up"
          trendPercent={2}
          trendLabel="vs last month"
          variant="teal"
        />
        <StatCard
          icon={<CheckSquare className="h-5 w-5" />}
          label="Open Tasks"
          value={data.openTasksCount}
          trendDirection={data.openTasksCount > 5 ? 'down' : 'up'}
          trendLabel={data.openTasksCount > 5 ? 'needs attention' : 'on track'}
          variant="gold"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Reserve Fund"
          value={reserveFormatted}
          trendDirection="up"
          trendPercent={1.4}
          trendLabel="vs last month"
          variant="green"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Expense trend bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Expenses vs Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.expenseTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="budget" name="Budget" fill="#E8ECF4" radius={[3, 3, 0, 0]} />
                <Bar dataKey="amount" name="Actual" fill="#0D9E8A" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Expense breakdown donut */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.expenseBreakdown}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="amount"
                  nameKey="category"
                >
                  {data.expenseBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>}
                  iconSize={8}
                />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent tasks */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Recent Tasks</CardTitle>
              <a href="/dashboard/tasks" className="text-xs font-medium text-teal hover:text-teal-600">
                View all →
              </a>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-gray-100">
              {data.recentTasks.map(task => (
                <li key={task.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {task.assigneeName && (
                        <span className="text-xs text-gray-500">{task.assigneeName}</span>
                      )}
                      {task.dueDate && (
                        <span className="text-xs text-gray-400">
                          · Due {format(parseISO(task.dueDate), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {priorityBadge(task.priority)}
                    {statusBadge(task.status)}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Right column: upcoming meetings + messages */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-teal" />
                  Upcoming Meetings
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {data.upcomingMeetings.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No upcoming meetings</p>
              ) : (
                <ul className="space-y-3">
                  {data.upcomingMeetings.map(meeting => (
                    <li key={meeting.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <p className="text-sm font-medium text-gray-900">{meeting.title}</p>
                      <p className="mt-0.5 text-xs text-teal font-medium">
                        {format(parseISO(meeting.scheduledAt), 'MMM d, yyyy · h:mm a')}
                      </p>
                      {meeting.location && (
                        <p className="text-xs text-gray-500 mt-0.5">{meeting.location}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-teal" />
                  Recent Activity
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-3">
                {data.recentPosts.map(post => (
                  <li key={post.id} className="flex gap-2.5">
                    <Avatar name={post.authorName} size="xs" className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700">{post.authorName}</p>
                      <p className="text-xs text-gray-500 truncate">{post.body}</p>
                      <p className="text-xs text-gray-400">{post.boardName}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
