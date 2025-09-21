'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { captureReactError } from '@/lib/debug-logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to debug logger for AI analysis
    captureReactError(error, errorInfo)

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught:', error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback or default error UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            <div className="p-8 rounded-lg shadow-sm" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
              <h2 className="text-2xl font-semibold mb-4 text-red-600">
                Something went wrong
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                An unexpected error occurred. The error has been logged for debugging.
              </p>
              <details className="text-left mb-4">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  Error details
                </summary>
                <pre className="mt-2 p-2 text-xs bg-gray-100 dark:bg-gray-800 rounded overflow-auto">
                  {this.state.error?.message}
                </pre>
              </details>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-white rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--accent)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent)'}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}