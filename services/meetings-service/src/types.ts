export interface AgendaItem {
  id: string
  order: number
  title: string
  duration: number | null
}

export interface Meeting {
  id: string
  hoaId: string
  title: string
  scheduledAt: string
  location: string | null
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  agendaItems: AgendaItem[]
  minutes: string | null
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface CreateMeetingInput {
  title: string
  scheduledAt: string
  location: string | null
  agendaItems: Array<{ order: number; title: string; duration: number | null }>
}
