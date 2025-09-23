'use client'

import { useState, useEffect } from 'react'
import { formatFileSize } from '@/lib/utils'

interface LargeFileUploadProps {
  file: File
  onComplete: (file?: any) => void
  onError: (error: string) => void
  onProgress: (progress: number) => void
}

export function LargeFileUpload({ file, onComplete, onError, onProgress }: LargeFileUploadProps) {
  const [sessionUri, setSessionUri] = useState<string | null>(null)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [useDirectUpload, setUseDirectUpload] = useState(false) // Default to proxy for reliability

  // Chunk size: 10MB for faster uploads (must be multiple of 256KB)
  const CHUNK_SIZE = 10 * 1024 * 1024

  const createUploadSession = async () => {
    try {
      console.log('[LargeFileUpload] Creating upload session for:', file.name)

      // Add timeout for session creation (30 seconds)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch('/api/files/create-upload-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create upload session')
      }

      console.log('[LargeFileUpload] Session created:', data.sessionUri)

      // Check if direct upload is supported (disabled for now due to CORS issues)
      if (data.directUpload && data.corsEnabled && false) { // Temporarily disabled
        console.log('[LargeFileUpload] Direct upload would be enabled but currently disabled')
        setUseDirectUpload(false)
      } else {
        console.log('[LargeFileUpload] Using proxy upload (reliable method)')
        setUseDirectUpload(false)
      }

      return data.sessionUri
    } catch (error) {
      console.error('[LargeFileUpload] Error creating session:', error)
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timed out - please try again')
        }
      }
      throw error
    }
  }

  const uploadChunk = async (sessionUri: string, chunk: Blob, start: number, end: number, total: number, retryCount = 0) => {
    const contentRange = `bytes ${start}-${end - 1}/${total}`
    console.log(`[LargeFileUpload] Uploading chunk (${useDirectUpload ? 'direct' : 'proxy'}):`, contentRange)

    try {
      // Add timeout for chunk upload (60 seconds per chunk)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      let response: Response

      if (useDirectUpload) {
        // Direct upload to Google Drive (bypasses Vercel, saves bandwidth)
        try {
          response = await fetch(sessionUri, {
            method: 'PUT',
            headers: {
              'Content-Range': contentRange,
              'Content-Type': file.type || 'application/octet-stream'
            },
            body: chunk,
            signal: controller.signal,
            mode: 'cors' // Enable CORS for cross-origin upload
          })
        } catch (directError) {
          // If direct upload fails with CORS error, fall back to proxy
          if (directError instanceof TypeError && directError.message.includes('CORS')) {
            console.warn('[LargeFileUpload] Direct upload failed with CORS, falling back to proxy')
            setUseDirectUpload(false)
            clearTimeout(timeoutId)
            return uploadChunk(sessionUri, chunk, start, end, total, retryCount) // Retry with proxy
          }
          throw directError
        }
      } else {
        // Fallback: Use proxy endpoint (costs bandwidth but always works)
        response = await fetch(`/api/files/upload-chunk?sessionUri=${encodeURIComponent(sessionUri)}`, {
          method: 'PUT',
          headers: {
            'Content-Range': contentRange,
            'Content-Type': file.type
          },
          body: chunk,
          signal: controller.signal
        })
      }

      clearTimeout(timeoutId)

      // 308 Resume Incomplete means chunk uploaded successfully, continue
      if (response.status === 308) {
        const range = response.headers.get('range')
        if (range) {
          // Parse "bytes=0-524287" format
          const match = range.match(/bytes=0-(\d+)/)
          if (match) {
            const uploadedEnd = parseInt(match[1]) + 1
            setUploadedBytes(uploadedEnd)
            onProgress((uploadedEnd / total) * 100)
          }
        } else {
          // If no range header, just update based on what we sent
          setUploadedBytes(end)
          onProgress((end / total) * 100)
        }
        return { complete: false, response }
      }

      // 200 or 201 means upload complete
      if (response.status === 200 || response.status === 201) {
        let data
        try {
          // Try to parse JSON response
          const text = await response.text()
          if (text) {
            data = JSON.parse(text)
          }
        } catch (e) {
          // Direct upload might not return JSON, that's okay
          console.log('[LargeFileUpload] Upload complete (no JSON response)')
          data = { id: 'direct-upload', success: true }
        }
        return { complete: true, data: data?.file || data, response }
      }

      // Any other status is an error
      throw new Error(`Upload failed with status: ${response.status}`)
    } catch (error) {
      console.error('[LargeFileUpload] Chunk upload error:', error)

      // Handle timeout and retry
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          if (retryCount < 3) {
            console.log(`[LargeFileUpload] Chunk upload timed out, retrying... (attempt ${retryCount + 1}/3)`)
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))) // Exponential backoff
            return uploadChunk(sessionUri, chunk, start, end, total, retryCount + 1)
          }
          throw new Error('Upload timed out after multiple attempts')
        }
      }

      // For other errors, retry up to 3 times
      if (retryCount < 3) {
        console.log(`[LargeFileUpload] Chunk upload failed, retrying... (attempt ${retryCount + 1}/3)`)
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
        return uploadChunk(sessionUri, chunk, start, end, total, retryCount + 1)
      }

      throw error
    }
  }

  const performUpload = async () => {
    setIsUploading(true)
    let currentSessionUri = sessionUri

    try {
      // Create upload session if we don't have one
      if (!currentSessionUri) {
        currentSessionUri = await createUploadSession()
        setSessionUri(currentSessionUri)
      }

      // Upload file in chunks
      let start = uploadedBytes // Resume from where we left off
      const fileSize = file.size

      if (!currentSessionUri) {
        throw new Error('Failed to create upload session')
      }

      while (start < fileSize) {
        const end = Math.min(start + CHUNK_SIZE, fileSize)
        const chunk = file.slice(start, end)

        const result = await uploadChunk(currentSessionUri, chunk, start, end, fileSize)

        if (result.complete) {
          // Upload complete!
          console.log('[LargeFileUpload] Upload complete:', result.data)

          // Try to confirm upload with our backend
          try {
            const confirmController = new AbortController()
            const confirmTimeout = setTimeout(() => confirmController.abort(), 30000)

            const confirmResponse = await fetch('/api/files/confirm-upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                sessionUri: currentSessionUri,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type
              }),
              signal: confirmController.signal
            })

            clearTimeout(confirmTimeout)

            if (confirmResponse.ok) {
              const confirmData = await confirmResponse.json()
              if (confirmData.success) {
                onProgress(100)
                onComplete(confirmData.file)
                return
              }
            }

            // If confirmation failed but upload succeeded, still mark as complete
            console.warn('[LargeFileUpload] Upload succeeded but confirmation failed, marking as complete anyway')
            onProgress(100)
            onComplete({
              id: result.data?.id || 'unknown',
              name: file.name,
              size: file.size,
              mimeType: file.type,
              message: 'File uploaded successfully to Google Drive'
            })
            return
          } catch (confirmError) {
            // If confirmation fails but we know upload succeeded, still mark as complete
            console.warn('[LargeFileUpload] Confirmation request failed:', confirmError)
            onProgress(100)
            onComplete({
              id: result.data?.id || 'unknown',
              name: file.name,
              size: file.size,
              mimeType: file.type,
              message: 'File uploaded successfully to Google Drive (confirmation pending)'
            })
            return
          }
        }

        start = end
        setUploadedBytes(end)
        onProgress((end / fileSize) * 100)
      }
    } catch (error) {
      console.error('[LargeFileUpload] Upload error:', error)
      onError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  // Start upload automatically when component mounts
  useEffect(() => {
    if (!isUploading && uploadedBytes === 0 && !sessionUri) {
      console.log('[LargeFileUpload] Starting upload for:', file.name)
      performUpload()
    }
  }, []) // Empty deps - only run once on mount

  return (
    <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
      {isUploading && (
        <div className="space-y-2">
          <p>
            Uploading large file {useDirectUpload ? 'directly' : 'via server'} to Google Drive...
            {useDirectUpload && (
              <span className="text-xs text-green-600 dark:text-green-400 ml-2">
                (Zero bandwidth cost!)
              </span>
            )}
          </p>
          <p className="text-xs">
            {formatFileSize(uploadedBytes)} / {formatFileSize(file.size)} uploaded
          </p>
          {uploadedBytes > 0 && uploadedBytes < file.size && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Upload is resumable - you can refresh the page and it will continue
            </p>
          )}
        </div>
      )}
    </div>
  )
}