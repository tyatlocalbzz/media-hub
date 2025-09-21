'use client'

import { useCallback } from 'react'
import { useError } from '@/app/contexts/ErrorContext'
import { formatUserError } from '@/lib/utils/errors'

export function useErrorHandler() {
  const { captureError } = useError()

  const handleError = useCallback(
    (error: unknown, context?: string) => {
      // Convert unknown to Error
      const errorObj = error instanceof Error ? error : new Error(String(error))

      // Capture for debugging
      captureError(errorObj, context)

      // Return user-friendly message
      return formatUserError(errorObj)
    },
    [captureError]
  )

  const handleAsync = useCallback(
    async <T,>(
      promise: Promise<T>,
      context?: string
    ): Promise<[T | null, string | null]> => {
      try {
        const result = await promise
        return [result, null]
      } catch (error) {
        const message = handleError(error, context)
        return [null, message]
      }
    },
    [handleError]
  )

  return {
    handleError,
    handleAsync
  }
}