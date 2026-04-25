export type ApiResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Content-Type': 'application/json',
}

export const ok = (body: unknown): ApiResponse => ({
  statusCode: 200,
  headers: corsHeaders,
  body: JSON.stringify(body),
})

export const created = (body: unknown): ApiResponse => ({
  statusCode: 201,
  headers: corsHeaders,
  body: JSON.stringify(body),
})

export const noContent = (): ApiResponse => ({
  statusCode: 204,
  headers: corsHeaders,
  body: '',
})

export const badRequest = (message: string): ApiResponse => ({
  statusCode: 400,
  headers: corsHeaders,
  body: JSON.stringify({ error: 'Bad Request', message }),
})

export const unauthorized = (): ApiResponse => ({
  statusCode: 401,
  headers: corsHeaders,
  body: JSON.stringify({ error: 'Unauthorized', message: 'Authentication required' }),
})

export const forbidden = (message = 'Insufficient permissions'): ApiResponse => ({
  statusCode: 403,
  headers: corsHeaders,
  body: JSON.stringify({ error: 'Forbidden', message }),
})

export const notFound = (resource: string): ApiResponse => ({
  statusCode: 404,
  headers: corsHeaders,
  body: JSON.stringify({ error: 'Not Found', message: `${resource} not found` }),
})

export const conflict = (message: string): ApiResponse => ({
  statusCode: 409,
  headers: corsHeaders,
  body: JSON.stringify({ error: 'Conflict', message }),
})

export const serverError = (message = 'Internal server error'): ApiResponse => ({
  statusCode: 500,
  headers: corsHeaders,
  body: JSON.stringify({ error: 'Internal Server Error', message }),
})
