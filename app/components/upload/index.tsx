'use client'

import { useState, useRef, DragEvent } from 'react'
import { config } from '@/lib/config'
import ClientUpload from './ClientUpload'
import type { UploadedFile, UploadComponentProps } from './types'
import { formatFileSize } from '@/lib/utils'

export function SmartFileUpload({ onUploadComplete }: UploadComponentProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadMethod, setUploadMethod] = useState<'server' | 'client' | null>(null)
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
    setUploadMethod(null)

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

    // Validate file size
    if (file.size > maxFileSize) {
      setError(`File too large. Maximum size is ${formatFileSize(maxFileSize)}`)
      return
    }

    // Determine upload method based on file size
    const useClientUpload = file.size > serverUploadLimit
    setSelectedFile(file)
    setUploadMethod(useClientUpload ? 'client' : 'server')

    console.log(`[SmartUpload] Using ${useClientUpload ? 'client' : 'server'} upload for file size ${formatFileSize(file.size)}`)

    if (useClientUpload) {
      // Large file - use client-side upload
      // The ClientUpload component will handle this
      console.log('[SmartUpload] File exceeds server limit, using client-side upload')
    } else {
      // Small file - use server-side upload
      await uploadViaServer(file)
    }
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
      setSelectedFile(null)
      setUploadMethod(null)
    }
  }

  const handleClientUploadComplete = (fileData: any) => {
    setUploadedFiles(prev => [...prev, fileData])
    setSuccess(`Successfully uploaded ${selectedFile?.name}`)
    setSelectedFile(null)
    setUploadMethod(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    if (onUploadComplete) {
      onUploadComplete()
    }
  }

  const handleClientUploadError = (error: Error) => {
    setError(error.message)
    setSelectedFile(null)
    setUploadMethod(null)
  }

  const isProduction = process.env.NODE_ENV === 'production'
  const serverLimitMB = serverUploadLimit / (1024 * 1024)
  const maxSizeGB = maxFileSize / (1024 * 1024 * 1024)

  return (
    <div className="w-full">
      {/* Info Banner */}
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          📊 Upload Limits: {isProduction ? `${serverLimitMB.toFixed(1)}MB` : `${maxSizeGB}GB`} via server
          {' • '}
          {maxSizeGB}GB via direct upload
        </p>
      </div>

      {/* Show ClientUpload component for large files */}
      {uploadMethod === 'client' && selectedFile && (
        <div className="mb-4">
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-4">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              🚀 Large file detected ({formatFileSize(selectedFile.size)}) - using direct upload to Google Drive
            </p>
          </div>
          <ClientUpload
            file={selectedFile}
            onUploadComplete={handleClientUploadComplete}
            onError={handleClientUploadError}
          />
        </div>
      )}

      {/* Standard Drop Zone (for server uploads) */}
      {uploadMethod !== 'client' && (
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
                  Max size: {maxSizeGB}GB • Supported: Video & Audio files
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Files over {formatFileSize(serverUploadLimit)} will use direct upload
                </p>
              </>
            )}
          </div>
        </div>
      )}

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
    </div>
  )
}