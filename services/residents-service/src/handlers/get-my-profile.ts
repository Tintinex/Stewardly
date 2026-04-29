import * as r from '../../../shared/response'
import type { LambdaEvent } from '../../../shared/types'
import { getMyProfile, generateAvatarUploadUrl } from '../repository'

/**
 * GET /api/residents/me
 *
 * Returns the current user's profile including their HOA name and a short-lived
 * presigned S3 GET URL for their avatar (if one is stored).
 *
 * Query param: ?avatarUpload=true — instead of a GET URL, return a presigned PUT
 * URL that the client can use to upload a new photo directly to S3.
 */
export async function handleGetMyProfile(event: LambdaEvent): Promise<r.ApiResponse> {
  const { hoaId, userId } = event.requestContext.authorizer.lambda
  if (!hoaId) return r.unauthorized()

  const wantsUploadUrl = event.queryStringParameters?.avatarUpload === 'true'

  const profile = await getMyProfile(hoaId, userId)
  if (!profile) {
    // Owner record doesn't exist yet — normal for brand-new sign-ins
    return r.notFound('Profile')
  }

  if (wantsUploadUrl) {
    // Return a presigned PUT URL so the client can upload directly to S3
    const { uploadUrl, avatarKey } = await generateAvatarUploadUrl(hoaId, profile.id)
    return r.ok({ uploadUrl, avatarKey })
  }

  return r.ok(profile)
}
