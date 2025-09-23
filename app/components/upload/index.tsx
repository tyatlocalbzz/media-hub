'use client'

import { useState, useRef, DragEvent } from 'react'
import { config } from '@/lib/config'
import type { UploadedFile, UploadComponentProps } from './types'
import { formatFileSize } from '@/lib/utils'
import { LargeFileUpload } from './LargeFileUpload'

export function SmartFileUpload({ onUploadComplete }: UploadComponentProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [largeFile, setLargeFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Get the server upload limit based on environment
  const serverUploadLimit = config.drive.serverUploadLimit || (4.5 * 1024 * 1024)
  const maxFileSize = config.drive.maxFileSize
  const supportedTypes = config.drive.supportedMimeTypes

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFiles(files)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFiles(Array.from(files))
    }
  }

  const handleFiles = async (files: File[]) => {
    // Reset states
    setError(null)
    setSuccess(null)

    // For now, handle single file (can be extended for multiple)
    const file = files[0]
    if (!file) return

    console.log('[SmartUpload] Processing file:', {
      name: file.name,
      type: file.type,
      size: formatFileSize(file.size),
      sizeBytes: file.size
    })

    // Validate file type
    if (!supportedTypes.includes(file.type)) {
      setError(`Unsupported file type: ${file.type}`)
      return
    }

    // Check file size against Vercel limit
    if (file.size > serverUploadLimit) {
      // Use resumable upload for large files
      console.log(`[SmartUpload] File too large for server upload (${formatFileSize(file.size)}), using resumable upload`)
      setLargeFile(file)
      setUploading(true)
      setError(null)
      return
    }

    // Check against absolute max size
    if (file.size > maxFileSize) {
      setError(`File exceeds maximum size of ${formatFileSize(maxFileSize)}`)
      return
    }

    console.log(`[SmartUpload] Uploading file of size ${formatFileSize(file.size)}`)
    await uploadViaServer(file)
  }

  const uploadViaServer = async (file: File) => {
    setUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)

      // Simple progress simulation for server upload
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 500)

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      })

      clearInterval(progressInterval)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setUploadProgress(100)
      setUploadedFiles(prev => [...prev, data.file])
      setSuccess(`Successfully uploaded ${file.name}`)

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      // Callback
      if (onUploadComplete) {
        onUploadComplete()
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const isProduction = process.env.NODE_ENV === 'production'
  const serverLimitMB = serverUploadLimit / (1024 * 1024)
  const maxSizeGB = maxFileSize / (1024 * 1024 * 1024)

  return (
    <div className="w-full">
      {/* Info Banner */}
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          📊 Upload Limit: {formatFileSize(serverUploadLimit)} (Vercel platform limit)
        </p>
      </div>

      {/* Drop Zone */}
      <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
            ${isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }
            ${uploading ? 'pointer-events-none opacity-50' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={supportedTypes.join(',')}
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="space-y-2">
            <div className="text-4xl">📁</div>

            {uploading ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Uploading... {Math.round(uploadProgress)}%
                </p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">
                  {isDragging ? 'Drop files here' : 'Click or drag files to upload'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Max size: {formatFileSize(serverUploadLimit)} • Supported: Video & Audio files
                </p>
              </>
            )}
          </div>
        </div>

      {/* Status Messages */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-400">❌ {error}</p>
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-400">✅ {success}</p>
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold mb-2">Recently Uploaded:</h3>
          <ul className="space-y-1">
            {uploadedFiles.map(file => (
              <li key={file.id} className="text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between">
                <span>📄 {file.name}</span>
                {file.webViewLink && (
                  <a
                    href={file.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600 text-xs"
                  >
                    View in Drive →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Large File Upload Handler */}
      {largeFile && uploading && (
        <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <h3 className="text-sm font-semibold mb-2">Large File Upload</h3>
          <p className="text-sm mb-2">
            Uploading {largeFile.name} ({formatFileSize(largeFile.size)})
          </p>
          <LargeFileUpload
            file={largeFile}
            onProgress={(progress) => {
              setUploadProgress(progress)
            }}
            onComplete={(file) => {
              setUploading(false)
              setUploadProgress(0)
              setLargeFile(null)
              if (file) {
                setUploadedFiles(prev => [...prev, file])
                setSuccess(`Successfully uploaded ${largeFile.name} to Google Drive`)
              }
              if (onUploadComplete) {
                onUploadComplete(file)
              }
            }}
            onError={(error) => {
              setUploading(false)
              setUploadProgress(0)
              setLargeFile(null)
              setError(error)
            }}
          />
          <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}