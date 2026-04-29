'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Home, CheckSquare, DollarSign, TrendingUp, Calendar, MessageSquare,
  Wrench, Megaphone, FileText, ArrowRight, Clock, CheckCircle, AlertCircle,
} from 'lucide-react'
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
import { UserCheck, AlertTriangle } from 'lucide-react'
import type { DashboardSummary, TaskStatus, TaskPriority, MyUnitData, Meeting, HoaStats } from '@/types'

// ── Badge helpers ─────────────────────────────────────────────────────────────

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

// ── Homeowner Dashboard ───────────────────────────────────────────────────────

function HomeownerDashboard() {
  const { user, hoaId, isLoading: authLoading } = useAuth()
  const [unitData, setUnitData] = useState<MyUnitData | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!hoaId) { setIsLoading(false); return }
    Promise.all([
      api.getMyUnit().catch(() => null),
      api.getMeetings(hoaId).catch(() => [] as Meeting[]),
    ]).then(([unit, mtgs]) => {
      setUnitData(unit)
      setMeetings(mtgs.filter(m => m.status === 'scheduled' && new Date(m.scheduledAt) > new Date()))
    }).finally(() => setIsLoading(false))
  }, [authLoading, hoaId])

  if (authLoading || isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
  }

  const unpaidDues = unitData?.assessments.filter(a => a.status !== 'paid') ?? []
  const overdueCount = unpaidDues.filter(a => a.status === 'overdue').length
  const nextMeeting = meetings[0]

  const quickLinks = [
    { href: '/dashboard/my-unit',       icon: Home,        label: 'My Unit',       desc: 'Unit info & dues', color: 'bg-blue-50 text-blue-600' },
    { href: '/dashboard/my-unit',       icon: Wrench,      label: 'Maintenance',   desc: 'Submit a request', color: 'bg-amber-50 text-amber-600' },
    { href: '/dashboard/announcements', icon: Megaphone,   label: 'Announcements', desc: 'Community news',   color: 'bg-teal-50 text-teal-600' },
    { href: '/dashboard/calendar',      icon: Calendar,    label: 'Calendar',      desc: 'Meetings & events', color: 'bg-purple-50 text-purple-600' },
    { href: '/dashboard/messages',      icon: MessageSquare, label: 'Messages',    desc: 'Community boards', color: 'bg-green-50 text-green-600' },
    { href: '/dashboard/documents',     icon: FileText,    label: 'Documents',     desc: 'HOA docs & rules', color: 'bg-rose-50 text-rose-600' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.firstName || user?.email?.split('@')[0] || 'there'}!
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
          {(user?.hoaName || unitData?.hoaName) && ` · ${user?.hoaName || unitData?.hoaName}`}
        </p>
      </div>

      {/* Status alerts */}
      {overdueCount > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">
            You have <strong>{overdueCount} overdue</strong> assessment{overdueCount > 1 ? 's' : ''}.{' '}
            <Link href="/dashboard/my-unit" className="font-medium underline">View details →</Link>
          </p>
        </div>
      )}

      {/* Unit summary card */}
      {unitData?.unit && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col sm:flex-row gap-5">
          <div className="flex items-start gap-4 flex-1">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy/5">
              <Home className="h-6 w-6 text-navy" />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Your Unit</p>
              <p className="text-xl font-bold text-gray-900">Unit {unitData.unit.unitNumber}</p>
              {unitData.unit.address && <p className="text-sm text-gray-500">{unitData.unit.address}</p>}
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                {unitData.unit.sqft && <span>{unitData.unit.sqft.toLocaleString()} sqft</span>}
                {unitData.unit.bedrooms && <span>{unitData.unit.bedrooms} bed</span>}
                {unitData.unit.bathrooms && <span>{unitData.unit.bathrooms} bath</span>}
              </div>
            </div>
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-gray-100 pt-4 sm:pt-0 sm:pl-5 flex gap-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 font-medium">Dues Status</p>
              {unpaidDues.length === 0 ? (
                <div className="mt-1 flex items-center gap-1 text-emerald-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-semibold">All paid</span>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-1 text-amber-600">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-semibold">{unpaidDues.length} pending</span>
                </div>
              )}
            </div>
            <Link href="/dashboard/my-unit" className="self-center text-xs font-medium text-teal hover:text-teal-600 flex items-center gap-0.5">
              Details <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Next meeting banner */}
      {nextMeeting && (
        <div className="rounded-xl border border-teal/20 bg-teal/5 p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal/10">
            <Calendar className="h-5 w-5 text-teal" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-teal font-semibold uppercase tracking-wide">Next Meeting</p>
            <p className="font-semibold text-gray-900 truncate">{nextMeeting.title}</p>
            <p className="text-sm text-gray-500">
              {format(parseISO(nextMeeting.scheduledAt), 'EEEE, MMMM d · h:mm a')}
              {nextMeeting.location && ` · ${nextMeeting.location}`}
            </p>
          </div>
          <Link href="/dashboard/calendar" className="shrink-0 text-xs font-medium text-teal hover:text-teal-600 flex items-center gap-1">
            Calendar <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Quick links grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {quickLinks.map(({ href, icon: Icon, label, desc, color }) => (
            <Link
              key={href + label}
              href={href}
              className="group rounded-xl border border-gray-200 bg-white p-4 hover:border-teal/40 hover:shadow-sm transition-all"
            >
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${color} mb-3`}>
                <Icon className="h-4.5 w-4.5" size={18} />
              </div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-teal transition-colors">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Upcoming meetings list */}
      {meetings.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-teal" />
                Upcoming Meetings
              </CardTitle>
              <Link href="/dashboard/calendar" className="text-xs font-medium text-teal hover:text-teal-600">View calendar →</Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {meetings.slice(0, 4).map(meeting => (
                <li key={meeting.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-sm font-medium text-gray-900">{meeting.title}</p>
                  <p className="mt-0.5 text-xs text-teal font-medium">
                    {format(parseISO(meeting.scheduledAt), 'MMM d, yyyy · h:mm a')}
                  </p>
                  {meeting.location && <p className="text-xs text-gray-500 mt-0.5">{meeting.location}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Board Dashboard (existing) ────────────────────────────────────────────────

function BoardDashboard() {
  const { hoaId, isLoading: authLoading } = useAuth()
  const [data, setData]         = useState<DashboardSummary | null>(null)
  const [stats, setStats]       = useState<HoaStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!hoaId) { setIsLoading(false); return }
    Promise.all([
      api.getDashboard(hoaId).catch(() => null),
      api.getHoaStats().catch(() => null),
    ]).then(([d, s]) => {
      setData(d)
      setStats(s)
    }).finally(() => setIsLoading(false))
  }, [authLoading, hoaId])

  if (authLoading || isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
  }

  if (!data) return null

  const reserveFormatted = `$${(data.reserveFundBalance / 1000).toFixed(0)}k`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{data.hoaName}</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {format(new Date(), 'EEEE, MMMM d, yyyy')} · Board Dashboard
        </p>
      </div>

      {/* Pending approvals alert */}
      {stats && stats.pendingMembers > 0 && (
        <Link href="/dashboard/members?status=pending"
          className="flex items-center gap-3 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 hover:bg-yellow-100 transition-colors">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-900">
              {stats.pendingMembers} resident{stats.pendingMembers > 1 ? 's' : ''} awaiting membership approval
            </p>
            <p className="text-xs text-yellow-700">Review and approve new residents on the Members page</p>
          </div>
          <span className="text-xs font-medium text-yellow-800 flex items-center gap-1 shrink-0">
            Review <UserCheck className="h-3.5 w-3.5" />
          </span>
        </Link>
      )}

      {/* HOA membership stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active Members',    value: stats.activeMembers,           color: 'text-emerald-600' },
            { label: 'Pending Approval',  value: stats.pendingMembers,          color: stats.pendingMembers > 0 ? 'text-yellow-600' : 'text-gray-400' },
            { label: 'Open Maintenance',  value: stats.openMaintenanceRequests, color: stats.urgentMaintenanceRequests > 0 ? 'text-red-600' : 'text-gray-600' },
            { label: 'Overdue Dues',      value: stats.overdueAssessments,      color: stats.overdueAssessments > 0 ? 'text-red-600' : 'text-gray-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Home className="h-5 w-5" />} label="Total Units" value={data.totalUnits} variant="navy" />
        <StatCard icon={<DollarSign className="h-5 w-5" />} label="Dues Collected" value={`${data.duesCollectedPercent}%`} trendDirection="up" trendPercent={2} trendLabel="vs last month" variant="teal" />
        <StatCard icon={<CheckSquare className="h-5 w-5" />} label="Open Tasks" value={data.openTasksCount} trendDirection={data.openTasksCount > 5 ? 'down' : 'up'} trendLabel={data.openTasksCount > 5 ? 'needs attention' : 'on track'} variant="gold" />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Reserve Fund" value={reserveFormatted} trendDirection="up" trendPercent={1.4} trendLabel="vs last month" variant="green" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Monthly Expenses vs Budget</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.expenseTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, '']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="budget" name="Budget" fill="#E8ECF4" radius={[3, 3, 0, 0]} />
                <Bar dataKey="amount" name="Actual" fill="#0D9E8A" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.expenseBreakdown} cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="amount" nameKey="category">
                  {data.expenseBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} iconSize={8} />
                <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Recent Tasks</CardTitle>
              <Link href="/dashboard/tasks" className="text-xs font-medium text-teal hover:text-teal-600">View all →</Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-gray-100">
              {data.recentTasks.map(task => (
                <li key={task.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {task.assigneeName && <span className="text-xs text-gray-500">{task.assigneeName}</span>}
                      {task.dueDate && <span className="text-xs text-gray-400">· Due {format(parseISO(task.dueDate), 'MMM d')}</span>}
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

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2"><Calendar className="h-4 w-4 text-teal" /> Upcoming Meetings</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {data.upcomingMeetings.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No upcoming meetings</p>
              ) : (
                <ul className="space-y-3">
                  {data.upcomingMeetings.map(meeting => (
                    <li key={meeting.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <p className="text-sm font-medium text-gray-900">{meeting.title}</p>
                      <p className="mt-0.5 text-xs text-teal font-medium">{format(parseISO(meeting.scheduledAt), 'MMM d, yyyy · h:mm a')}</p>
                      {meeting.location && <p className="text-xs text-gray-500 mt-0.5">{meeting.location}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-teal" /> Recent Activity</CardTitle>
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

// ── Router ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { role } = useAuth()
  // Board roles get the full management dashboard; homeowners get the resident view
  if (role === 'board_admin' || role === 'board_member') return <BoardDashboard />
  return <HomeownerDashboard />
}
