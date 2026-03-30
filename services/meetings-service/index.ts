import type { APIGatewayProxyEventV2WithLambdaAuthorizer } from 'aws-lambda'
import { query, queryOne, execute, param } from '../shared/db/client'
import * as r from '../shared/response'

interface AuthorizerContext {
  hoaId: string
  userId: string
  role: string
}

type MeetingEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>

interface Meeting {
  id: string
  hoaId: string
  title: string
  scheduledAt: string
  location: string | null
  status: string
  agendaItems: AgendaItem[]
  minutes: string | null
  createdById: string
  createdAt: string
  updatedAt: string
}

interface AgendaItem {
  id: string
  order: number
  title: string
  duration: number | null
}

export const handler = async (event: MeetingEvent) => {
  const hoaId = event.requestContext.authorizer.lambda.hoaId
  const userId = event.requestContext.authorizer.lambda.userId
  const role = event.requestContext.authorizer.lambda.role

  if (!hoaId) return r.unauthorized()

  const method = event.requestContext.http.method
  const meetingId = event.pathParameters?.meetingId

  try {
    // GET /api/meetings
    if (method === 'GET' && !meetingId) {
      const meetings = await query<Omit<Meeting, 'agendaItems'>>(
        `SELECT * FROM meetings WHERE hoa_id = :hoaId ORDER BY scheduled_at DESC`,
        [param.string('hoaId', hoaId)],
      )

      // Fetch agenda items for each meeting
      const meetingsWithAgenda = await Promise.all(
        meetings.map(async meeting => {
          const agendaItems = await query<AgendaItem>(
            `SELECT * FROM meeting_agenda_items WHERE meeting_id = :meetingId ORDER BY "order" ASC`,
            [param.string('meetingId', meeting.id)],
          )
          return { ...meeting, agendaItems }
        }),
      )

      return r.ok(meetingsWithAgenda)
    }

    // GET /api/meetings/{meetingId}
    if (method === 'GET' && meetingId) {
      const meeting = await queryOne<Omit<Meeting, 'agendaItems'>>(
        'SELECT * FROM meetings WHERE id = :meetingId AND hoa_id = :hoaId',
        [param.string('meetingId', meetingId), param.string('hoaId', hoaId)],
      )
      if (!meeting) return r.notFound('Meeting')

      const agendaItems = await query<AgendaItem>(
        'SELECT * FROM meeting_agenda_items WHERE meeting_id = :meetingId ORDER BY "order" ASC',
        [param.string('meetingId', meetingId)],
      )

      return r.ok({ ...meeting, agendaItems })
    }

    // POST /api/meetings
    if (method === 'POST') {
      if (role === 'homeowner') return r.forbidden('Only board members can schedule meetings')
      if (!event.body) return r.badRequest('Request body is required')

      const body = JSON.parse(event.body) as {
        title?: string
        scheduledAt?: string
        location?: string
        agendaItems?: Array<{ order: number; title: string; duration?: number | null }>
      }

      if (!body.title?.trim()) return r.badRequest('title is required')
      if (!body.scheduledAt) return r.badRequest('scheduledAt is required')

      const newMeetingId = await queryOne<{ id: string }>(
        `INSERT INTO meetings (id, hoa_id, title, scheduled_at, location, status, created_by_id)
         VALUES (gen_random_uuid(), :hoaId, :title, :scheduledAt, :location, 'scheduled', :createdById)
         RETURNING id`,
        [
          param.string('hoaId', hoaId),
          param.string('title', body.title.trim()),
          param.string('scheduledAt', body.scheduledAt),
          param.stringOrNull('location', body.location ?? null),
          param.string('createdById', userId),
        ],
      )

      if (!newMeetingId?.id) return r.serverError('Failed to create meeting')

      // Insert agenda items
      if (body.agendaItems?.length) {
        for (const item of body.agendaItems) {
          await execute(
            `INSERT INTO meeting_agenda_items (id, meeting_id, hoa_id, "order", title, duration_minutes)
             VALUES (gen_random_uuid(), :meetingId, :hoaId, :order, :title, :duration)`,
            [
              param.string('meetingId', newMeetingId.id),
              param.string('hoaId', hoaId),
              param.int('order', item.order),
              param.string('title', item.title),
              item.duration != null ? param.int('duration', item.duration) : param.stringOrNull('duration', null),
            ],
          )
        }
      }

      const created = await queryOne<Omit<Meeting, 'agendaItems'>>(
        'SELECT * FROM meetings WHERE id = :meetingId',
        [param.string('meetingId', newMeetingId.id)],
      )
      const agendaItems = await query<AgendaItem>(
        'SELECT * FROM meeting_agenda_items WHERE meeting_id = :meetingId ORDER BY "order" ASC',
        [param.string('meetingId', newMeetingId.id)],
      )

      return r.created({ ...created, agendaItems })
    }

    return r.badRequest('Unsupported method')
  } catch (err) {
    console.error('Meetings handler error:', err)
    return r.serverError()
  }
}
