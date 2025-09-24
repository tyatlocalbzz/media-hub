// Simple error logging service for Media Hub
// This replaces Sentry with a lightweight solution

interface ErrorContext {
  userId?: string
  action?: string
  metadata?: Record<string, any>
}

interface LogEntry {
  timestamp: string
  level: 'error' | 'warn' | 'info' | 'debug'
  message: string
  error?: any
  context?: ErrorContext
  stack?: string
}

class ErrorLogger {
  private isDevelopment = process.env.NODE_ENV === 'development'

  // Format log entry for console output
  private formatLog(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.message
    ]

    if (entry.context?.action) {
      parts.push(`| Action: ${entry.context.action}`)
    }

    if (entry.context?.userId) {
      parts.push(`| User: ${entry.context.userId}`)
    }

    return parts.join(' ')
  }

  // Get current timestamp in ISO format
  private getTimestamp(): string {
    return new Date().toISOString()
  }

  // Extract error details
  private extractErrorDetails(error: any): { message: string; stack?: string } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack
      }
    }

    if (typeof error === 'string') {
      return { message: error }
    }

    return {
      message: JSON.stringify(error)
    }
  }

  // Log error
  error(message: string, error?: any, context?: ErrorContext): void {
    const errorDetails = error ? this.extractErrorDetails(error) : undefined

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'error',
      message,
      error: errorDetails?.message,
      stack: errorDetails?.stack,
      context
    }

    // Always log to console
    console.error(this.formatLog(entry))

    // In development, also log stack trace
    if (this.isDevelopment && errorDetails?.stack) {
      console.error('Stack trace:', errorDetails.stack)
    }

    // In production, you could send critical errors to a webhook or database
    if (!this.isDevelopment && this.isCriticalError(message, error)) {
      this.reportCriticalError(entry)
    }
  }

  // Log warning
  warn(message: string, context?: ErrorContext): void {
    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'warn',
      message,
      context
    }

    console.warn(this.formatLog(entry))
  }

  // Log info
  info(message: string, context?: ErrorContext): void {
    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'info',
      message,
      context
    }

    console.log(this.formatLog(entry))
  }

  // Log debug (only in development)
  debug(message: string, context?: ErrorContext): void {
    if (!this.isDevelopment) return

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'debug',
      message,
      context
    }

    console.log(this.formatLog(entry))
  }

  // Determine if error is critical
  private isCriticalError(message: string, error?: any): boolean {
    // Define what constitutes a critical error
    const criticalPatterns = [
      'database connection failed',
      'authentication failed',
      'google drive api error',
      'out of memory',
      'unhandled rejection',
      'fatal error'
    ]

    const lowerMessage = message.toLowerCase()
    const errorMessage = error?.message?.toLowerCase() || ''

    return criticalPatterns.some(pattern =>
      lowerMessage.includes(pattern) || errorMessage.includes(pattern)
    )
  }

  // Report critical errors (can be extended to send to webhook)
  private async reportCriticalError(entry: LogEntry): Promise<void> {
    try {
      // For now, just log to console with special formatting
      console.error('🚨 CRITICAL ERROR:', entry)

      // In the future, you could send to a webhook:
      // await fetch(process.env.ERROR_WEBHOOK_URL, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(entry)
      // })

      // Or write to a database error log table
    } catch (reportError) {
      // Don't let error reporting cause additional errors
      console.error('Failed to report critical error:', reportError)
    }
  }

  // Track API errors with context
  apiError(
    endpoint: string,
    error: any,
    context?: ErrorContext
  ): void {
    this.error(
      `API Error: ${endpoint}`,
      error,
      {
        ...context,
        action: `api:${endpoint}`,
        metadata: {
          ...context?.metadata,
          endpoint
        }
      }
    )
  }

  // Track upload errors
  uploadError(
    fileName: string,
    error: any,
    context?: ErrorContext
  ): void {
    this.error(
      `Upload failed: ${fileName}`,
      error,
      {
        ...context,
        action: 'upload',
        metadata: {
          ...context?.metadata,
          fileName
        }
      }
    )
  }

  // Track rate limit errors
  rateLimitError(
    userId: string,
    limitType: string,
    context?: ErrorContext
  ): void {
    this.warn(
      `Rate limit exceeded: ${limitType}`,
      {
        ...context,
        userId,
        action: 'rate_limit',
        metadata: {
          ...context?.metadata,
          limitType
        }
      }
    )
  }
}

// Export singleton instance
export const logger = new ErrorLogger()

// Export type for use in other files
export type { ErrorContext, LogEntry }