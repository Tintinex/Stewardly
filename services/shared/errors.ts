/**
 * Domain errors used across Lambda services.
 * Throw these in handlers/service layers; catch them in index.ts to return appropriate HTTP responses.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message)
    this.name = 'ForbiddenError'
  }
}
