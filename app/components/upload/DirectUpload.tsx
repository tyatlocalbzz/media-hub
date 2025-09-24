'use client'

import { useState, useEffect } from 'react'
import { formatFileSize } from '@/lib/utils'

interface DirectUploadProps {
  file: File
  onComplete: (result: any) => void
  onError: (error: string) => void
  onProgress: (progress: number) => void
}

export function DirectUpload({ file, onComplete, onError, onProgress }: DirectUploadProps) {
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [fileKey, setFileKey] = useState<string | null>(null)
  const [bucketName, setBucketName] = useState<string | null>(null)
  const [uploadStarted, setUploadStarted] = useState(false)

  // Get signed URL for upload
  const getSignedUrl = async () => {
    try {
      console.log('[DirectUpload] Getting signed URL for:', file.name)

      const response = await fetch('/api/files/create-signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          resumable: file.size > 100 * 1024 * 1024 // Use resumable for files > 100MB
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to get upload URL')
      }

      const data = await response.json()
      console.log('[DirectUpload] Got signed URL:', data.fileKey)

      setUploadUrl(data.uploadUrl)
      setFileKey(data.fileKey)
      setBucketName(data.bucketName)

      return data
    } catch (error) {
      console.error('[DirectUpload] Error getting signed URL:', error)
      throw error
    }
  }

  // Upload directly to GCS
  const uploadToGCS = async (url: string) => {
    try {
      console.log('[DirectUpload] Starting direct upload to GCS')

      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          onProgress(percentComplete)
          console.log(`[DirectUpload] Progress: ${percentComplete.toFixed(1)}%`)
        }
      })

      // Handle completion
      return new Promise<void>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 201) {
            console.log('[DirectUpload] Upload completed successfully')
            resolve()
          } else {
            reject(new Error(`Upload failed with status: ${xhr.status}`))
          }
        })

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'))
        })

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload was aborted'))
        })

        // Prepare upload
        xhr.open('PUT', url, true)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

        // Start upload
        xhr.send(file)
      })
    } catch (error) {
      console.error('[DirectUpload] Upload error:', error)
      throw error
    }
  }

  // Process uploaded file (move from GCS to Drive)
  const processUploadedFile = async () => {
    try {
      console.log('[DirectUpload] Processing uploaded file')

      const response = await fetch('/api/files/process-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bucketName,
          fileKey,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to process uploaded file')
      }

      const data = await response.json()
      console.log('[DirectUpload] File processed:', data)

      return data
    } catch (error) {
      console.error('[DirectUpload] Error processing file:', error)
      throw error
    }
  }

  // Main upload flow
  const performUpload = async () => {
    if (uploadStarted) return
    setUploadStarted(true)

    try {
      // Step 1: Get signed URL
      const { uploadUrl } = await getSignedUrl()

      // Step 2: Upload directly to GCS
      await uploadToGCS(uploadUrl)

      // Step 3: Process the uploaded file (move to Drive)
      const result = await processUploadedFile()

      // Complete!
      onProgress(100)
      onComplete(result.file)
    } catch (error) {
      console.error('[DirectUpload] Upload failed:', error)
      onError(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  // Start upload when component mounts
  useEffect(() => {
    if (!uploadStarted && !uploadUrl) {
      performUpload()
    }
  }, [])

  return (
    <div className="text-sm text-gray-600 dark:text-gray-400">
      <p className="font-medium">{file.name}</p>
      <p className="text-xs">{formatFileSize(file.size)}</p>
      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
        ✨ Zero-bandwidth direct upload to cloud storage
      </p>
    </div>
  )
}