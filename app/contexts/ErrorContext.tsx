'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { captureError } from '@/lib/debug-logger'

interface ErrorContextType {
  lastError: Error | null
  errorCount: number
  captureError: (error: Error, context?: string) => void
  clearErrors: () => void
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined)

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [lastError, setLastError] = useState<Error | null>(null)
  const [errorCount, setErrorCount] = useState(0)

  const handleCaptureError = useCallback((error: Error, context?: string) => {
    setLastError(error)
    setErrorCount(prev => prev + 1)
    captureError(error, context)
  }, [])

  const clearErrors = useCallback(() => {
    setLastError(null)
    setErrorCount(0)
  }, [])

  return (
    <ErrorContext.Provider
      value={{
        lastError,
        errorCount,
        captureError: handleCaptureError,
        clearErrors
      }}
    >
      {children}
    </ErrorContext.Provider>
  )
}

export function useError() {
  const context = useContext(ErrorContext)
  if (context === undefined) {
    throw new Error('useError must be used within an ErrorProvider')
  }
  return context
}