import * as r from '../../../shared/response'
import type { LambdaEvent } from '../../../shared/types'
import { getMyProfile, updateOwnerProfile } from '../repository'

interface UpdateProfileBody {
  avatarKey?: string    // S3 key after a successful presigned PUT upload
  firstName?: string
  lastName?: string
  phone?: string | null
}

/**
 * PATCH /api/residents/me (handled via POST in the router using action dispatch)
 *
 * Updates the current user's profile fields. Most commonly called right after
 * an avatar upload to persist the new S3 key.
 */
export async function handleUpdateMyProfile(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, userId } = event.requestContext.authorizer.lambda
  if (!hoaId) return r.unauthorized()

  if (!event.body) return r.badRequest('Request body is required')

  const parsed = JSON.parse(event.body) as UpdateProfileBody

  // At least one field must be provided
  if (!parsed.avatarKey && !parsed.firstName && !parsed.lastName && parsed.phone === undefined) {
    return r.badRequest('Nothing to update')
  }

  await updateOwnerProfile({
    hoaId,
    cognitoSub: userId,
    avatarKey: parsed.avatarKey ?? undefined,
    firstName:  parsed.firstName?.trim()  ?? undefined,
    lastName:   parsed.lastName?.trim()   ?? undefined,
    phone:      parsed.phone !== undefined ? parsed.phone : undefined,
  })

  const updated = await getMyProfile(hoaId, userId)
  if (!updated) return r.notFound('Profile')

  return r.ok(updated)
}
