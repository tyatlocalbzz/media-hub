// Error handling utilities for Media Hub

export class MediaHubError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message)
    this.name = 'MediaHubError'
  }
}

export class ProcessingError extends MediaHubError {
  constructor(
    message: string,
    public fileId?: string,
    details?: any
  ) {
    super(message, 'PROCESSING_ERROR', 500, details)
    this.name = 'ProcessingError'
  }
}

export class AuthenticationError extends MediaHubError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401)
    this.name = 'AuthenticationError'
  }
}

export class ValidationError extends MediaHubError {
  constructor(
    message: string,
    public field?: string,
    public value?: any
  ) {
    super(message, 'VALIDATION_ERROR', 400, { field, value })
    this.name = 'ValidationError'
  }
}

export class QuotaExceededError extends MediaHubError {
  constructor(
    message: string,
    public quotaType: 'storage' | 'transcription' | 'api',
    public limit?: number,
    public current?: number
  ) {
    super(message, 'QUOTA_EXCEEDED', 429, { quotaType, limit, current })
    this.name = 'QuotaExceededError'
  }
}

export class DriveApiError extends MediaHubError {
  constructor(
    message: string,
    public driveError?: any
  ) {
    super(message, 'DRIVE_API_ERROR', 503, driveError)
    this.name = 'DriveApiError'
  }
}

export class TranscriptionError extends ProcessingError {
  constructor(
    message: string,
    fileId?: string,
    public service?: string,
    public originalError?: any
  ) {
    super(message, fileId, { service, originalError })
    this.code = 'TRANSCRIPTION_ERROR'
    this.name = 'TranscriptionError'
  }
}

// Error handler for API routes
export function handleApiError(error: unknown): {
  message: string
  code: string
  statusCode: number
  details?: any
} {
  console.error('API Error:', error)

  if (error instanceof MediaHubError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'INTERNAL_ERROR',
      statusCode: 500
    }
  }

  return {
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
    statusCode: 500
  }
}

// Error handler for processing jobs
export function handleProcessingError(error: unknown, fileId?: string): string {
  if (error instanceof ProcessingError) {
    return error.message
  }

  if (error instanceof Error) {
    return `Processing failed: ${error.message}`
  }

  return 'Processing failed: Unknown error'
}

// Retry logic for failed operations
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

// Validate file for processing
export function validateMediaFile(file: {
  name: string
  mimeType?: string
  size?: number | bigint
}): ValidationError | null {
  const { drive } = require('@/lib/config').config

  if (!file.mimeType || !drive.supportedMimeTypes.includes(file.mimeType)) {
    return new ValidationError(
      'Unsupported file type',
      'mimeType',
      file.mimeType
    )
  }

  const size = typeof file.size === 'bigint' ? Number(file.size) : file.size

  if (size && size > drive.maxFileSize) {
    return new ValidationError(
      `File size exceeds maximum of ${drive.maxFileSize / (1024 * 1024)}MB`,
      'size',
      size
    )
  }

  return null
}

// Format error for user display
export function formatUserError(error: unknown): string {
  if (error instanceof QuotaExceededError) {
    return `You've exceeded your ${error.quotaType} quota. Please upgrade your plan or wait.`
  }

  if (error instanceof ValidationError) {
    return error.message
  }

  if (error instanceof AuthenticationError) {
    return 'Please sign in to continue'
  }

  if (error instanceof DriveApiError) {
    return 'Unable to access Google Drive. Please try again later.'
  }

  if (error instanceof TranscriptionError) {
    return 'Transcription failed. Please try again or contact support.'
  }

  if (error instanceof MediaHubError) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

// Log error with context
export function logError(
  error: unknown,
  context: {
    userId?: string
    fileId?: string
    operation?: string
    metadata?: any
  }
): void {
  const timestamp = new Date().toISOString()
  const errorInfo = error instanceof Error ? {
    name: error.name,
    message: error.message,
    stack: error.stack
  } : { error }

  console.error('[ERROR]', {
    timestamp,
    ...context,
    ...errorInfo
  })

  // In production, you might want to send this to a logging service
  // like Sentry, LogRocket, or Datadog
}