// Standardized error handling

import { NextResponse } from 'next/server'
import { createLogger } from './logger'

const logger = createLogger('ERROR')

// Custom error classes
export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly details?: any

  constructor(
    message: string,
    statusCode = 500,
    isOperational = true,
    details?: any
  ) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.details = details

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor)
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', details?: any) {
    super(message, 401, true, details)
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied', details?: any) {
    super(message, 403, true, details)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: any) {
    super(message, 400, true, details)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: any) {
    super(message, 404, true, details)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: any) {
    super(message, 409, true, details)
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', details?: any) {
    super(message, 429, true, details)
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: any) {
    super(`${service} error: ${message}`, 503, true, details)
  }
}

// Error response builder
export interface ErrorResponse {
  error: string
  message?: string
  details?: any
  timestamp?: string
  path?: string
}

export function buildErrorResponse(
  error: AppError | Error,
  path?: string
): ErrorResponse {
  const response: ErrorResponse = {
    error: error.message,
    timestamp: new Date().toISOString(),
  }

  if (path) {
    response.path = path
  }

  if (error instanceof AppError) {
    if (error.details) {
      response.details = error.details
    }
  } else {
    // For non-AppError errors in development, include stack trace
    if (process.env.NODE_ENV === 'development') {
      response.details = {
        stack: error.stack,
      }
    }
  }

  return response
}

// API error handler
export function handleApiError(error: unknown, context: string): NextResponse {
  // Log the error
  logger.error(`API Error in ${context}:`, error)

  // Handle known errors
  if (error instanceof AppError) {
    return NextResponse.json(
      buildErrorResponse(error, context),
      { status: error.statusCode }
    )
  }

  // Handle Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as any

    switch (prismaError.code) {
      case 'P2002':
        return NextResponse.json(
          buildErrorResponse(
            new ConflictError('Duplicate entry', {
              field: prismaError.meta?.target,
            }),
            context
          ),
          { status: 409 }
        )

      case 'P2025':
        return NextResponse.json(
          buildErrorResponse(
            new NotFoundError('Record not found'),
            context
          ),
          { status: 404 }
        )

      case 'P2003':
        return NextResponse.json(
          buildErrorResponse(
            new ValidationError('Foreign key constraint failed', {
              field: prismaError.meta?.field_name,
            }),
            context
          ),
          { status: 400 }
        )

      default:
        return NextResponse.json(
          buildErrorResponse(
            new AppError('Database error', 500, false, {
              code: prismaError.code,
            }),
            context
          ),
          { status: 500 }
        )
    }
  }

  // Handle Google API errors
  if (error && typeof error === 'object' && 'response' in error) {
    const googleError = error as any
    const status = googleError.response?.status || 500
    const message = googleError.response?.data?.error?.message || 'Google API error'

    return NextResponse.json(
      buildErrorResponse(
        new ExternalServiceError('Google', message, {
          status,
          errors: googleError.response?.data?.error?.errors,
        }),
        context
      ),
      { status: status >= 500 ? 503 : status }
    )
  }

  // Handle unknown errors
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred'

  return NextResponse.json(
    buildErrorResponse(
      new AppError(message, 500, false),
      context
    ),
    { status: 500 }
  )
}

// Async error wrapper for route handlers
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  context: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (error) {
      return handleApiError(error, context)
    }
  }) as T
}

// Validation helpers
export function validateRequired(
  data: Record<string, any>,
  fields: string[]
): void {
  const missing = fields.filter(field => !data[field])

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`)
  }
}

export function validateFileSize(size: number, maxSize: number): void {
  if (size > maxSize) {
    throw new ValidationError(
      `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
      { size, maxSize }
    )
  }
}

export function validateMimeType(
  mimeType: string,
  allowedTypes: string[]
): void {
  if (!allowedTypes.includes(mimeType)) {
    throw new ValidationError(
      'Unsupported file type',
      { mimeType, allowedTypes }
    )
  }
}