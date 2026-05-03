'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Calendar, MapPin, ChevronDown, FileText, CheckSquare } from 'lucide-react'
import { format, parseISO, isFuture, isPast } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import * as api from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Meeting, CreateMeetingPayload } from '@/types'
import { clsx } from 'clsx'

export default function MeetingsPage() {
  const { hoaId, isLoading: authLoading } = useAuth()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formTime, setFormTime] = useState('18:30')
  const [formLocation, setFormLocation] = useState('')
  const [formAgendaItems, setFormAgendaItems] = useState<{ title: string; duration: string }[]>([
    { title: '', duration: '' },
  ])
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadMeetings = useCallback(async () => {
    if (!hoaId) return
    const data = await api.getMeetings(hoaId)
    setMeetings(data)
  }, [hoaId])

  useEffect(() => {
    if (authLoading) return
    loadMeetings().finally(() => setIsLoading(false))
  }, [authLoading, loadMeetings])

  // A meeting belongs in "past" if its date has already passed OR it's completed/cancelled.
  // "Upcoming" is strictly: scheduled status AND the date is still in the future.
  const upcoming = meetings
    .filter(m => m.status === 'scheduled' && isFuture(parseISO(m.scheduledAt)))
    .sort((a, b) => parseISO(a.scheduledAt).getTime() - parseISO(b.scheduledAt).getTime())

  const past = meetings
    .filter(m => isPast(parseISO(m.scheduledAt)) || m.status === 'completed' || m.status === 'cancelled')
    .sort((a, b) => parseISO(b.scheduledAt).getTime() - parseISO(a.scheduledAt).getTime())

  const addAgendaItem = () => {
    setFormAgendaItems(prev => [...prev, { title: '', duration: '' }])
  }

  const removeAgendaItem = (idx: number) => {
    setFormAgendaItems(prev => prev.filter((_, i) => i !== idx))
  }

  const resetForm = () => {
    setFormTitle('')
    setFormDate('')
    setFormTime('18:30')
    setFormLocation('')
    setFormAgendaItems([{ title: '', duration: '' }])
    setFormError(null)
  }

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hoaId) return
    setFormError(null)
    setFormLoading(true)
    try {
      const scheduledAt = new Date(`${formDate}T${formTime}:00`).toISOString()
      const payload: CreateMeetingPayload = {
        title: formTitle,
        scheduledAt,
        location: formLocation || undefined,
        agendaItems: formAgendaItems
          .filter(ai => ai.title.trim())
          .map((ai, i) => ({
            order: i + 1,
            title: ai.title,
            duration: ai.duration ? parseInt(ai.duration, 10) : null,
          })),
      }
      const created = await api.createMeeting(hoaId, payload)
      setMeetings(prev => [created, ...prev])
      setIsModalOpen(false)
      resetForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to schedule meeting')
    } finally {
      setFormLoading(false)
    }
  }

  if (authLoading || isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
  }

  const MeetingCard = ({ meeting, isPastMeeting = false }: { meeting: Meeting; isPastMeeting?: boolean }) => {
    const isExpanded = expandedId === meeting.id
    return (
      <div className={clsx(
        'rounded-xl border shadow-sm transition-shadow',
        isPastMeeting ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200',
        isExpanded
          ? isPastMeeting ? 'shadow-sm' : 'border-teal-200 shadow-md'
          : 'hover:shadow-md',
      )}>
        <div
          className="flex items-start gap-4 p-5 cursor-pointer"
          onClick={() => setExpandedId(id => id === meeting.id ? null : meeting.id)}
        >
          {/* Date badge */}
          <div className={clsx(
            'shrink-0 rounded-lg px-3 py-2 text-center min-w-[52px]',
            isPastMeeting ? 'bg-gray-300 text-gray-600' : 'bg-navy text-white',
          )}>
            <p className="text-xs font-medium uppercase opacity-70">
              {format(parseISO(meeting.scheduledAt), 'MMM')}
            </p>
            <p className="text-xl font-bold leading-none">
              {format(parseISO(meeting.scheduledAt), 'd')}
            </p>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className={clsx(
                  'font-semibold',
                  isPastMeeting ? 'text-gray-400' : 'text-gray-900',
                )}>{meeting.title}</h3>
                <div className={clsx(
                  'mt-1 flex flex-wrap items-center gap-3 text-sm',
                  isPastMeeting ? 'text-gray-400' : 'text-gray-500',
                )}>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(parseISO(meeting.scheduledAt), 'EEEE, MMMM d · h:mm a')}
                  </span>
                  {meeting.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {meeting.location}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={meeting.status === 'completed' ? 'success' : meeting.status === 'cancelled' ? 'danger' : isPastMeeting ? 'default' : 'info'}>
                  {isPastMeeting && meeting.status === 'scheduled' ? 'Occurred' : meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}
                </Badge>
                <ChevronDown className={clsx(
                  'h-4 w-4 transition-transform',
                  isPastMeeting ? 'text-gray-300' : 'text-gray-400',
                  isExpanded && 'rotate-180',
                )} />
              </div>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className={clsx(
            'border-t px-5 pb-5 pt-4 space-y-4',
            isPastMeeting ? 'border-gray-100' : 'border-gray-100',
          )}>
            {/* Agenda */}
            {meeting.agendaItems.length > 0 && (
              <div>
                <h4 className={clsx(
                  'text-sm font-semibold mb-2 flex items-center gap-1.5',
                  isPastMeeting ? 'text-gray-400' : 'text-gray-900',
                )}>
                  <CheckSquare className={clsx('h-4 w-4', isPastMeeting ? 'text-gray-400' : 'text-teal')} />
                  Agenda ({meeting.agendaItems.length} items)
                </h4>
                <ol className="space-y-1.5">
                  {meeting.agendaItems.map(item => (
                    <li key={item.id} className={clsx(
                      'flex items-center gap-2 text-sm',
                      isPastMeeting ? 'text-gray-400' : 'text-gray-600',
                    )}>
                      <span className={clsx(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                        isPastMeeting ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-500',
                      )}>
                        {item.order}
                      </span>
                      <span className="flex-1">{item.title}</span>
                      {item.duration && (
                        <span className="text-xs text-gray-400">{item.duration} min</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Minutes */}
            {meeting.minutes ? (
              <div>
                <h4 className={clsx(
                  'text-sm font-semibold mb-2 flex items-center gap-1.5',
                  isPastMeeting ? 'text-gray-400' : 'text-gray-900',
                )}>
                  <FileText className={clsx('h-4 w-4', isPastMeeting ? 'text-gray-400' : 'text-teal')} />
                  Meeting Minutes
                </h4>
                <pre className="whitespace-pre-wrap rounded-lg bg-gray-100 border border-gray-200 p-4 text-xs text-gray-500 font-sans leading-relaxed max-h-64 overflow-y-auto">
                  {meeting.minutes}
                </pre>
              </div>
            ) : (meeting.status === 'completed' || isPastMeeting) ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
                <p className="text-sm text-gray-400">No minutes recorded for this meeting.</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
          <p className="text-sm text-gray-500">{upcoming.length} upcoming · {past.length} past</p>
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setIsModalOpen(true)}>
          Schedule Meeting
        </Button>
      </div>

      {/* Upcoming */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-8 w-8" />}
            title="No upcoming meetings"
            description="Schedule a board meeting to keep residents informed."
            ctaLabel="Schedule Meeting"
            onCta={() => setIsModalOpen(true)}
          />
        ) : (
          <div className="space-y-3">
            {upcoming.map(m => <MeetingCard key={m.id} meeting={m} isPastMeeting={false} />)}
          </div>
        )}
      </section>

      {/* Past */}
      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Past Meetings
          </h2>
          <div className="space-y-3">
            {past.map(m => <MeetingCard key={m.id} meeting={m} isPastMeeting={true} />)}
          </div>
        </section>
      )}

      {/* Schedule Meeting Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title="Schedule Meeting"
        size="lg"
      >
        <form onSubmit={handleCreateMeeting} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          <Input
            label="Meeting Title"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            placeholder="e.g., Monthly Board Meeting — September 2024"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Date"
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
              required
            />
            <Input
              label="Time"
              type="time"
              value={formTime}
              onChange={e => setFormTime(e.target.value)}
              required
            />
          </div>
          <Input
            label="Location (optional)"
            value={formLocation}
            onChange={e => setFormLocation(e.target.value)}
            placeholder="e.g., Community Room B or Zoom link"
          />

          {/* Agenda items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Agenda Items</label>
              <button
                type="button"
                onClick={addAgendaItem}
                className="text-xs font-medium text-teal hover:text-teal-600"
              >
                + Add Item
              </button>
            </div>
            <div className="space-y-2">
              {formAgendaItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={item.title}
                    onChange={e => {
                      const updated = [...formAgendaItems]
                      updated[idx] = { ...updated[idx], title: e.target.value }
                      setFormAgendaItems(updated)
                    }}
                    placeholder="Agenda item title"
                    className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                  />
                  <input
                    type="number"
                    value={item.duration}
                    onChange={e => {
                      const updated = [...formAgendaItems]
                      updated[idx] = { ...updated[idx], duration: e.target.value }
                      setFormAgendaItems(updated)
                    }}
                    placeholder="min"
                    className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                    min={1}
                  />
                  {formAgendaItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAgendaItem(idx)}
                      className="text-gray-300 hover:text-red-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              Cancel
            </Button>
            <Button type="submit" isLoading={formLoading}>
              Schedule Meeting
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
