import type { CreateMeetingInput } from './types'

export function parseCreateInput(raw: unknown): CreateMeetingInput | string {
  if (!raw || typeof raw !== 'object') return 'Request body must be a JSON object'
  const b = raw as Record<string, unknown>

  if (!b.title || typeof b.title !== 'string' || !b.title.trim()) return 'title is required'
  if (!b.scheduledAt || typeof b.scheduledAt !== 'string') return 'scheduledAt is required'

  const agendaItems: CreateMeetingInput['agendaItems'] = []
  if (Array.isArray(b.agendaItems)) {
    for (const item of b.agendaItems as Array<Record<string, unknown>>) {
      agendaItems.push({
        order: typeof item.order === 'number' ? item.order : 0,
        title: typeof item.title === 'string' ? item.title : '',
        duration: typeof item.duration === 'number' ? item.duration : null,
      })
    }
  }

  return {
    title: (b.title as string).trim(),
    scheduledAt: b.scheduledAt as string,
    location: typeof b.location === 'string' ? b.location : null,
    agendaItems,
  }
}
