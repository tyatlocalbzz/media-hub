// Debug Logger for Vibe Coding
// Captures errors, console logs, and network requests for AI debugging

interface LogEntry {
  timestamp: string
  type: 'error' | 'warn' | 'info' | 'log' | 'network' | 'react-error'
  message: string
  data?: any
  stack?: string
  url?: string
  method?: string
  status?: number
}

interface NetworkRequest {
  url: string
  method: string
  headers?: Record<string, string>
  body?: any
  timestamp: string
}

interface NetworkResponse {
  url: string
  status: number
  statusText: string
  headers?: Record<string, string>
  body?: any
  timestamp: string
  duration?: number
}

class DebugLogger {
  private logs: LogEntry[] = []
  private maxLogs = 100
  private networkRequests = new Map<string, NetworkRequest>()
  private originalConsole: {
    log: typeof console.log
    error: typeof console.error
    warn: typeof console.warn
    info: typeof console.info
  }
  private originalFetch: typeof fetch
  private enabled = false

  constructor() {
    // Store original console methods
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    }

    // Initialize fetch later (client-side only)
    this.originalFetch = fetch

    // Only enable in development and browser
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      // Defer initialization to ensure window is available
      setTimeout(() => this.enable(), 0)
    }
  }

  enable() {
    if (this.enabled) return
    this.enabled = true

    // Intercept console methods
    console.log = (...args) => {
      this.addLog('log', args.join(' '))
      this.originalConsole.log(...args)
    }

    console.error = (...args) => {
      this.addLog('error', args.join(' '), this.getStackTrace())
      this.originalConsole.error(...args)
    }

    console.warn = (...args) => {
      this.addLog('warn', args.join(' '))
      this.originalConsole.warn(...args)
    }

    console.info = (...args) => {
      this.addLog('info', args.join(' '))
      this.originalConsole.info(...args)
    }

    // Intercept fetch for network logging (only in browser)
    if (typeof window !== 'undefined') {
      // Store original fetch with proper binding
      this.originalFetch = window.fetch.bind(window)

      window.fetch = async (...args) => {
        const [url, options] = args
        const requestId = Math.random().toString(36)
        const startTime = Date.now()

        // Log request
        const request: NetworkRequest = {
          url: typeof url === 'string' ? url : url.toString(),
          method: options?.method || 'GET',
          headers: this.sanitizeHeaders(options?.headers),
          body: this.sanitizeBody(options?.body),
          timestamp: new Date().toISOString()
        }
        this.networkRequests.set(requestId, request)

        try {
          const response = await this.originalFetch(...args)
          const duration = Date.now() - startTime

          // Log response
          this.addLog('network', `${request.method} ${request.url} - ${response.status}`, undefined, {
            url: request.url,
            method: request.method,
            status: response.status,
            duration
          })

          return response
        } catch (error) {
          const duration = Date.now() - startTime

          // Log network error
          this.addLog('network', `${request.method} ${request.url} - Failed`, undefined, {
            url: request.url,
            method: request.method,
            error: error instanceof Error ? error.message : 'Network error',
            duration
          })

          throw error
        }
      }
    }

    // Listen for unhandled promise rejections (only in browser)
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        this.addLog('error', `Unhandled Promise Rejection: ${event.reason}`, this.getStackTrace())
      })

      // Listen for global errors
      window.addEventListener('error', (event) => {
        this.addLog('error', event.message, event.error?.stack || this.getStackTrace())
      })
    }
  }

  disable() {
    if (!this.enabled) return
    this.enabled = false

    // Restore original console methods
    console.log = this.originalConsole.log
    console.error = this.originalConsole.error
    console.warn = this.originalConsole.warn
    console.info = this.originalConsole.info

    // Restore original fetch (only in browser)
    if (typeof window !== 'undefined' && this.originalFetch) {
      window.fetch = this.originalFetch
    }
  }

  addLog(
    type: LogEntry['type'],
    message: string,
    stack?: string,
    networkData?: { url: string; method: string; status?: number; duration?: number; error?: string }
  ) {
    const log: LogEntry = {
      timestamp: new Date().toISOString(),
      type,
      message: this.sanitizeMessage(message),
      stack: stack ? this.sanitizeStack(stack) : undefined,
      ...networkData
    }

    this.logs.push(log)

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
  }

  // Add React error
  addReactError(error: Error, errorInfo?: { componentStack?: string }) {
    this.addLog(
      'react-error',
      error.message,
      error.stack + (errorInfo?.componentStack || '')
    )
  }

  // Get stack trace
  private getStackTrace(): string {
    const error = new Error()
    return error.stack || ''
  }

  // Sanitize sensitive data
  private sanitizeMessage(message: string): string {
    // Remove potential sensitive data patterns
    return message
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]')
      .replace(/api[_-]?key["\s]*[:=]["\s]*[^"\s,;}]+/gi, 'api_key=[REDACTED]')
      .replace(/password["\s]*[:=]["\s]*[^"\s,;}]+/gi, 'password=[REDACTED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
  }

  private sanitizeStack(stack: string): string {
    // Remove absolute paths but keep relative ones
    return stack.replace(/\/Users\/[^/]+/g, '~')
  }

  private sanitizeHeaders(headers?: any): Record<string, string> | undefined {
    if (!headers) return undefined

    const sanitized: Record<string, string> = {}
    const headersObj = headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers

    for (const [key, value] of Object.entries(headersObj)) {
      if (key.toLowerCase().includes('auth') || key.toLowerCase().includes('token')) {
        sanitized[key] = '[REDACTED]'
      } else {
        sanitized[key] = String(value)
      }
    }

    return sanitized
  }

  private sanitizeBody(body?: any): any {
    if (!body) return undefined
    if (typeof body === 'string') {
      return this.sanitizeMessage(body)
    }
    return '[BODY DATA]'
  }

  // Get all logs
  getLogs(): LogEntry[] {
    return this.logs
  }

  // Get error count
  getErrorCount(): number {
    return this.logs.filter(log => log.type === 'error' || log.type === 'react-error').length
  }

  // Clear all logs
  clear() {
    this.logs = []
    this.networkRequests.clear()
  }

  // Export logs for AI debugging
  exportForAI(): string {
    const output = {
      timestamp: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        nodeEnv: process.env.NODE_ENV
      },
      errorSummary: {
        totalErrors: this.getErrorCount(),
        recentErrors: this.logs
          .filter(log => log.type === 'error' || log.type === 'react-error')
          .slice(-5)
          .map(log => ({
            time: log.timestamp,
            message: log.message,
            type: log.type
          }))
      },
      recentLogs: this.logs.slice(-30),
      sessionInfo: {
        totalLogs: this.logs.length,
        logTypes: this.logs.reduce((acc, log) => {
          acc[log.type] = (acc[log.type] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      }
    }

    return `🐛 DEBUG LOG FOR AI ANALYSIS
=====================================
Generated: ${output.timestamp}
URL: ${output.environment.url}
Viewport: ${output.environment.viewport}

ERROR SUMMARY (${output.errorSummary.totalErrors} total errors)
-------------------------------------
${output.errorSummary.recentErrors.map(e =>
  `[${e.time}] ${e.type}: ${e.message}`
).join('\n') || 'No recent errors'}

RECENT ACTIVITY (last 30 logs)
-------------------------------------
${output.recentLogs.map(log => {
  let entry = `[${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}`
  if (log.url) entry += ` | ${log.method} ${log.url} (${log.status || 'pending'})`
  if (log.stack) entry += '\n  Stack: ' + log.stack.split('\n').slice(0, 3).join('\n  ')
  return entry
}).join('\n')}

SESSION INFO
-------------------------------------
Total Logs: ${output.sessionInfo.totalLogs}
Log Breakdown: ${JSON.stringify(output.sessionInfo.logTypes, null, 2)}

INSTRUCTIONS FOR AI
-------------------------------------
Please analyze the above debug log and identify:
1. Any errors or exceptions that occurred
2. The sequence of events leading to issues
3. Potential root causes
4. Suggested fixes or debugging steps
`
  }
}

// Create singleton instance (safe for SSR)
let debugLoggerInstance: DebugLogger | null = null

export const debugLogger = (() => {
  if (typeof window !== 'undefined') {
    if (!debugLoggerInstance) {
      debugLoggerInstance = new DebugLogger()
    }
    return debugLoggerInstance
  }
  // Return a stub for SSR
  return {
    getLogs: () => [],
    getErrorCount: () => 0,
    clear: () => {},
    exportForAI: () => '',
    addReactError: () => {},
    addLog: () => {}
  } as unknown as DebugLogger
})()

// Export for use in components
export const captureError = (error: Error, context?: string) => {
  debugLogger.addLog('error', `${context ? context + ': ' : ''}${error.message}`, error.stack)
}

export const captureReactError = (error: Error, errorInfo?: { componentStack?: string }) => {
  debugLogger.addReactError(error, errorInfo)
}

export const getDebugInfo = () => debugLogger.exportForAI()
export const clearDebugLogs = () => debugLogger.clear()
export const getErrorCount = () => debugLogger.getErrorCount()