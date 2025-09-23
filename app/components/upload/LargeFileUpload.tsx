'use client'

import { useState } from 'react'
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

  // Chunk size: 5MB (must be multiple of 256KB)
  const CHUNK_SIZE = 5 * 1024 * 1024

  const createUploadSession = async () => {
    try {
      console.log('[LargeFileUpload] Creating upload session for:', file.name)

      const response = await fetch('/api/files/create-upload-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create upload session')
      }

      console.log('[LargeFileUpload] Session created:', data.sessionUri)
      return data.sessionUri
    } catch (error) {
      console.error('[LargeFileUpload] Error creating session:', error)
      throw error
    }
  }

  const uploadChunk = async (sessionUri: string, chunk: Blob, start: number, end: number, total: number) => {
    const contentRange = `bytes ${start}-${end - 1}/${total}`
    console.log('[LargeFileUpload] Uploading chunk:', contentRange)

    try {
      const response = await fetch(sessionUri, {
        method: 'PUT',
        headers: {
          'Content-Range': contentRange,
          'Content-Type': file.type
        },
        body: chunk
      })

      // 308 Resume Incomplete means chunk uploaded successfully, continue
      if (response.status === 308) {
        const range = response.headers.get('Range')
        if (range) {
          // Parse "bytes=0-524287" format
          const match = range.match(/bytes=0-(\d+)/)
          if (match) {
            const uploadedEnd = parseInt(match[1]) + 1
            setUploadedBytes(uploadedEnd)
            onProgress((uploadedEnd / total) * 100)
          }
        }
        return { complete: false, response }
      }

      // 200 or 201 means upload complete
      if (response.status === 200 || response.status === 201) {
        const data = await response.json()
        return { complete: true, data, response }
      }

      // Any other status is an error
      throw new Error(`Upload failed with status: ${response.status}`)
    } catch (error) {
      console.error('[LargeFileUpload] Chunk upload error:', error)
      // Network errors - we can retry
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

          // Confirm upload with our backend
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
            })
          })

          const confirmData = await confirmResponse.json()

          if (!confirmResponse.ok || !confirmData.success) {
            throw new Error(confirmData.error || 'Failed to confirm upload')
          }

          onProgress(100)
          onComplete(confirmData.file)
          return
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

  // Start upload automatically
  if (!isUploading && uploadedBytes === 0) {
    performUpload()
  }

  return (
    <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
      {isUploading && (
        <div className="space-y-2">
          <p>Uploading large file directly to Google Drive...</p>
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