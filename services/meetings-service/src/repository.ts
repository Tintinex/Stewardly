import { query, queryOne, execute, param } from '../../shared/db/client'
import type { Meeting, AgendaItem, CreateMeetingInput } from './types'

/** Resolve a Cognito sub to the owner's DB id within an HOA. */
async function resolveOwnerId(hoaId: string, cognitoSub: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM owners WHERE hoa_id = :hoaId AND cognito_sub = :cognitoSub LIMIT 1',
    [param.string('hoaId', hoaId), param.string('cognitoSub', cognitoSub)],
  )
  return row?.id ?? null
}

export async function listMeetings(hoaId: string): Promise<Meeting[]> {
  const meetings = await query<Omit<Meeting, 'agendaItems'>>(
    'SELECT * FROM meetings WHERE hoa_id = :hoaId ORDER BY scheduled_at DESC',
    [param.string('hoaId', hoaId)],
  )
  return Promise.all(meetings.map(async m => ({
    ...m,
    agendaItems: await getAgendaItems(m.id),
  })))
}

export async function getMeeting(hoaId: string, meetingId: string): Promise<Meeting | null> {
  const meeting = await queryOne<Omit<Meeting, 'agendaItems'>>(
    'SELECT * FROM meetings WHERE id = :meetingId AND hoa_id = :hoaId',
    [param.string('meetingId', meetingId), param.string('hoaId', hoaId)],
  )
  if (!meeting) return null
  return { ...meeting, agendaItems: await getAgendaItems(meetingId) }
}

async function getAgendaItems(meetingId: string): Promise<AgendaItem[]> {
  return query<AgendaItem>(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = :meetingId ORDER BY "order" ASC',
    [param.string('meetingId', meetingId)],
  )
}

export async function createMeeting(hoaId: string, userId: string, input: CreateMeetingInput): Promise<Meeting | null> {
  // userId is the Cognito sub — resolve to the owner's DB id for the FK constraint
  const ownerId = await resolveOwnerId(hoaId, userId)
  if (!ownerId) throw new Error(`No owner record found for user ${userId} in HOA ${hoaId}`)

  const row = await queryOne<{ id: string }>(
    `INSERT INTO meetings (id, hoa_id, title, scheduled_at, location, status, created_by_id)
     VALUES (gen_random_uuid(), :hoaId, :title, :scheduledAt, :location, 'scheduled', :createdById)
     RETURNING id`,
    [
      param.string('hoaId', hoaId),
      param.string('title', input.title),
      param.string('scheduledAt', input.scheduledAt),
      param.stringOrNull('location', input.location),
      param.string('createdById', ownerId),
    ],
  )
  if (!row?.id) return null

  for (const item of input.agendaItems) {
    await execute(
      `INSERT INTO meeting_agenda_items (id, meeting_id, hoa_id, "order", title, duration_minutes)
       VALUES (gen_random_uuid(), :meetingId, :hoaId, :order, :title, :duration)`,
      [
        param.string('meetingId', row.id),
        param.string('hoaId', hoaId),
        param.int('order', item.order),
        param.string('title', item.title),
        item.duration != null ? param.int('duration', item.duration) : param.stringOrNull('duration', null),
      ],
    )
  }

  return getMeeting(hoaId, row.id)
}
