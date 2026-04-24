'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Calendar, MapPin, CheckSquare,
  FileText, Download, X,
} from 'lucide-react'
import { format, parseISO, isSameDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isToday } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Meeting } from '@/types'
import { clsx } from 'clsx'

// ─── iCal generation ──────────────────────────────────────────────────────────

function generateIcs(meeting: Meeting): string {
  const start = new Date(meeting.scheduledAt)
  const end = new Date(start.getTime() + 60 * 60 * 1000) // 1h default
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stewardly//HOA Calendar//EN',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${meeting.title}`,
    meeting.location ? `LOCATION:${meeting.location}` : '',
    `STATUS:${meeting.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
}

function downloadIcs(meeting: Meeting): void {
  const content = generateIcs(meeting)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${meeting.title.replace(/\s+/g, '-').toLowerCase()}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Status config ────────────────────────────────────────────────────────────

const statusConfig = {
  scheduled: { label: 'Scheduled', dotClass: 'bg-teal-500',   badgeVariant: 'info'    as const },
  completed: { label: 'Completed', dotClass: 'bg-gray-400',   badgeVariant: 'default' as const },
  cancelled: { label: 'Cancelled', dotClass: 'bg-red-400',    badgeVariant: 'danger'  as const },
}

// ─── Calendar grid builder ────────────────────────────────────────────────────

function buildCalendarGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 })
  const days: Date[] = []
  let d = start
  while (d <= end) {
    days.push(d)
    d = addDays(d, 1)
  }
  return days
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { hoaId, isLoading: authLoading } = useAuth()

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)

  useEffect(() => {
    if (authLoading) return
    api.getMeetings(hoaId ?? '').then(setMeetings).finally(() => setIsLoading(false))
  }, [authLoading, hoaId])

  const calendarDays = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth])
  const currentMonthStart = startOfMonth(currentMonth)
  const currentMonthEnd = endOfMonth(currentMonth)

  const getMeetingsForDay = useCallback((day: Date) => {
    return meetings.filter(m => isSameDay(parseISO(m.scheduledAt), day))
  }, [meetings])

  const upcomingMeetings = useMemo(() => {
    const now = new Date()
    return meetings
      .filter(m => m.status === 'scheduled' && new Date(m.scheduledAt) >= now)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .slice(0, 5)
  }, [meetings])

  const goToPrevMonth = () => setCurrentMonth(m => subMonths(m, 1))
  const goToNextMonth = () => setCurrentMonth(m => addMonths(m, 1))
  const goToToday = () => setCurrentMonth(new Date())

  if (authLoading || isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting Calendar</h1>
          <p className="text-sm text-gray-500">
            {meetings.length} {meetings.length === 1 ? 'meeting' : 'meetings'} total
          </p>
        </div>
      </div>

      <div className="flex gap-4 items-start">

        {/* Calendar grid */}
        <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

          {/* Month navigation */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <button
                onClick={goToPrevMonth}
                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={goToNextMonth}
                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
            {WEEKDAY_LABELS.map(day => (
              <div key={day} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
                {day}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const inCurrentMonth = day >= currentMonthStart && day <= currentMonthEnd
              const dayMeetings = getMeetingsForDay(day)
              const todayFlag = isToday(day)

              return (
                <div
                  key={idx}
                  className={clsx(
                    'min-h-[80px] border-b border-r border-gray-100 p-1.5 last:border-r-0',
                    !inCurrentMonth && 'bg-gray-50/60',
                    idx % 7 === 6 && 'border-r-0',
                  )}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-end">
                    <span className={clsx(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      todayFlag
                        ? 'bg-teal-500 text-white'
                        : inCurrentMonth
                          ? 'text-gray-700'
                          : 'text-gray-300',
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Meeting chips */}
                  <div className="mt-0.5 space-y-0.5">
                    {dayMeetings.slice(0, 3).map(meeting => {
                      const cfg = statusConfig[meeting.status]
                      return (
                        <button
                          key={meeting.id}
                          onClick={() => setSelectedMeeting(meeting)}
                          className={clsx(
                            'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs transition-colors hover:opacity-80',
                            meeting.status === 'scheduled' && 'bg-teal-50 text-teal-700',
                            meeting.status === 'completed' && 'bg-gray-100 text-gray-500',
                            meeting.status === 'cancelled' && 'bg-red-50 text-red-500 line-through',
                          )}
                          title={meeting.title}
                        >
                          <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', cfg.dotClass)} />
                          <span className="truncate leading-tight">{meeting.title}</span>
                        </button>
                      )
                    })}
                    {dayMeetings.length > 3 && (
                      <p className="pl-1 text-xs text-gray-400">+{dayMeetings.length - 3} more</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 border-t border-gray-100 px-5 py-3">
            {Object.entries(statusConfig).map(([status, cfg]) => (
              <div key={status} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={clsx('h-2 w-2 rounded-full', cfg.dotClass)} />
                {cfg.label}
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming sidebar */}
        <div className="w-72 shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3.5">
            <h3 className="font-semibold text-gray-900">Upcoming Meetings</h3>
            <p className="text-xs text-gray-400">Next {upcomingMeetings.length} scheduled</p>
          </div>

          {upcomingMeetings.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-8 w-8" />}
              title="No upcoming meetings"
              description="Check back when new meetings are scheduled."
            />
          ) : (
            <ul className="divide-y divide-gray-50">
              {upcomingMeetings.map(meeting => (
                <li key={meeting.id}>
                  <button
                    onClick={() => setSelectedMeeting(meeting)}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    {/* Date badge + title */}
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 rounded-lg bg-navy px-2 py-1.5 text-center text-white min-w-[40px]">
                        <p className="text-xs font-medium uppercase opacity-60">
                          {format(parseISO(meeting.scheduledAt), 'MMM')}
                        </p>
                        <p className="text-base font-bold leading-none">
                          {format(parseISO(meeting.scheduledAt), 'd')}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{meeting.title}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {format(parseISO(meeting.scheduledAt), 'h:mm a')}
                        </p>
                        {meeting.location && (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-400">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {meeting.location}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Meeting Detail Modal */}
      {selectedMeeting && (
        <Modal
          isOpen={!!selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          title={selectedMeeting.title}
          size="lg"
        >
          <div className="space-y-5">
            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={statusConfig[selectedMeeting.status].badgeVariant}>
                {statusConfig[selectedMeeting.status].label}
              </Badge>
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <Calendar className="h-4 w-4 text-gray-400" />
                {format(parseISO(selectedMeeting.scheduledAt), 'EEEE, MMMM d, yyyy · h:mm a')}
              </div>
              {selectedMeeting.location && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  {selectedMeeting.location}
                </div>
              )}
            </div>

            {/* Agenda items */}
            {selectedMeeting.agendaItems.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                  <CheckSquare className="h-4 w-4 text-teal-500" />
                  Agenda ({selectedMeeting.agendaItems.length} items)
                </h4>
                <ol className="space-y-1.5">
                  {selectedMeeting.agendaItems.map(item => (
                    <li key={item.id} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                        {item.order}
                      </span>
                      <span className="flex-1">{item.title}</span>
                      {item.duration && (
                        <span className="shrink-0 text-xs text-gray-400">{item.duration} min</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Meeting minutes */}
            {selectedMeeting.minutes ? (
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                  <FileText className="h-4 w-4 text-teal-500" />
                  Meeting Minutes
                </h4>
                <pre className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 font-sans text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
                  {selectedMeeting.minutes}
                </pre>
              </div>
            ) : selectedMeeting.status === 'completed' ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
                <p className="text-sm text-gray-400">No minutes recorded for this meeting.</p>
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
              <Button variant="outline" onClick={() => setSelectedMeeting(null)}>
                Close
              </Button>
              {selectedMeeting.status !== 'cancelled' && (
                <Button
                  leftIcon={<Download className="h-4 w-4" />}
                  onClick={() => downloadIcs(selectedMeeting)}
                >
                  Add to Calendar
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
