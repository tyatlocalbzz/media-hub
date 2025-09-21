// Centralized logging system

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel
  timestamp: Date
  context: string
  message: string
  data?: any
  error?: Error
}

class Logger {
  private context: string
  private minLevel: LogLevel

  constructor(context: string) {
    this.context = context
    // In production, only log warnings and errors
    this.minLevel = process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString()
    const level = LogLevel[entry.level]
    const prefix = `[${timestamp}] [${level}] [${entry.context}]`

    return `${prefix} ${entry.message}`
  }

  private log(level: LogLevel, message: string, data?: any, error?: Error) {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      level,
      timestamp: new Date(),
      context: this.context,
      message,
      data,
      error,
    }

    const formattedMessage = this.formatMessage(entry)

    // Choose console method based on level
    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage, data || '', error || '')
        break
      case LogLevel.WARN:
        console.warn(formattedMessage, data || '')
        break
      case LogLevel.INFO:
        console.info(formattedMessage, data || '')
        break
      case LogLevel.DEBUG:
        console.log(formattedMessage, data || '')
        break
    }

    // In production, you might want to send logs to an external service
    if (process.env.NODE_ENV === 'production' && level >= LogLevel.ERROR) {
      // TODO: Send to error tracking service (e.g., Sentry)
    }
  }

  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data)
  }

  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data)
  }

  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data)
  }

  error(message: string, error?: Error | any, data?: any) {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, data, error)
    } else {
      this.log(LogLevel.ERROR, message, { ...data, error })
    }
  }

  // Create a child logger with additional context
  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`)
  }
}

// Export factory function for creating loggers
export function createLogger(context: string): Logger {
  return new Logger(context)
}

// Pre-configured loggers for common contexts
export const loggers = {
  auth: createLogger('AUTH'),
  upload: createLogger('UPLOAD'),
  drive: createLogger('DRIVE'),
  database: createLogger('DATABASE'),
  api: createLogger('API'),
}

// Default export for quick usage
export default createLogger