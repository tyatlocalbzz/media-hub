'use client'

import { useState, useRef, DragEvent, useEffect } from 'react'
import { formatFileSize } from '@/lib/utils'
import { LargeFileUpload } from './LargeFileUpload'
import type { UploadedFile } from './types'

interface FileGroup {
  instant: File[]     // < 4.5 MB - server upload
  medium: File[]      // 4.5 MB - 500 MB - resumable via proxy
  manual: File[]      // > 500 MB - need manual upload
}

interface FileUploadStatus {
  file: File
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'too-large'
  progress: number
  error?: string
  result?: UploadedFile
}

interface BatchUploadProps {
  onUploadComplete?: () => void
  userFolderId?: string
}

// File size limits
const INSTANT_LIMIT = 4.5 * 1024 * 1024      // 4.5 MB - Vercel function limit
const MEDIUM_LIMIT = 500 * 1024 * 1024       // 500 MB - Resumable upload limit

export function BatchUpload({ onUploadComplete, userFolderId }: BatchUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [fileStatuses, setFileStatuses] = useState<FileUploadStatus[]>([])
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number | null>(null)
  const [showManualInstructions, setShowManualInstructions] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Categorize files by size
  const categorizeFiles = (files: File[]): FileGroup => {
    return files.reduce((groups, file) => {
      if (file.size <= INSTANT_LIMIT) {
        groups.instant.push(file)
      } else if (file.size <= MEDIUM_LIMIT) {
        groups.medium.push(file)
      } else {
        groups.manual.push(file)
      }
      return groups
    }, { instant: [], medium: [], manual: [] } as FileGroup)
  }

  // Handle file drop
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    console.log('[BatchUpload] handleDrop - DataTransfer info:', {
      filesCount: e.dataTransfer.files.length,
      types: e.dataTransfer.types,
      effectAllowed: e.dataTransfer.effectAllowed,
      dropEffect: e.dataTransfer.dropEffect
    })

    const files = Array.from(e.dataTransfer.files)
    console.log('[BatchUpload] handleDrop - Files from drop:', files.map((f, i) => ({
      index: i,
      name: f.name,
      size: f.size,
      type: f.type,
      lastModified: f.lastModified,
      webkitRelativePath: (f as any).webkitRelativePath
    })))

    if (files.length > 0) {
      handleFiles(files)
    }
  }

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[BatchUpload] handleFileSelect - Input event:', {
      filesCount: e.target.files?.length,
      inputValue: e.target.value
    })

    const files = e.target.files
    if (files && files.length > 0) {
      const filesArray = Array.from(files)
      console.log('[BatchUpload] handleFileSelect - Files from input:', filesArray.map((f, i) => ({
        index: i,
        name: f.name,
        size: f.size,
        sizeInMB: (f.size / (1024 * 1024)).toFixed(2),
        type: f.type,
        lastModified: new Date(f.lastModified).toISOString()
      })))
      handleFiles(filesArray)
    } else {
      console.log('[BatchUpload] handleFileSelect - No files selected')
    }
  }

  // Process selected files
  const handleFiles = (files: File[]) => {
    // CRITICAL: Log exact file sizes immediately
    console.log('[BatchUpload] Files received:', files.map(f => ({
      name: f.name,
      size: f.size,
      sizeFormatted: formatFileSize(f.size),
      type: f.type,
      lastModified: new Date(f.lastModified).toISOString()
    })))

    // Deep inspection of first file
    if (files.length > 0) {
      const firstFile = files[0]
      console.log('[BatchUpload] First file deep inspection:', {
        fileName: firstFile.name,
        fileSize: firstFile.size,
        fileSizeInBytes: firstFile.size.toString(),
        fileSizeHex: '0x' + firstFile.size.toString(16),
        fileType: firstFile.type,
        lastModified: firstFile.lastModified,
        fileKeys: Object.keys(firstFile),
        fileProto: Object.getPrototypeOf(firstFile).constructor.name,
        isFile: firstFile instanceof File,
        isBlob: firstFile instanceof Blob
      })

      // Try to read a small portion to verify file is readable
      const testSlice = firstFile.slice(0, 1024)
      console.log('[BatchUpload] Test slice (first 1KB):', {
        sliceSize: testSlice.size,
        sliceType: testSlice.type
      })

      // Check if we can read the full file size
      if (firstFile.size > 10 * 1024 * 1024) { // Only for files > 10MB
        // Test reading from different positions
        const positions = [
          { start: 0, end: 1024, label: 'First 1KB' },
          { start: Math.floor(firstFile.size / 2), end: Math.floor(firstFile.size / 2) + 1024, label: 'Middle 1KB' },
          { start: Math.max(0, firstFile.size - 1024), end: firstFile.size, label: 'Last 1KB' }
        ]

        positions.forEach(pos => {
          try {
            const slice = firstFile.slice(pos.start, pos.end)
            console.log(`[BatchUpload] ${pos.label} test:`, {
              requestedStart: pos.start,
              requestedEnd: pos.end,
              expectedSize: pos.end - pos.start,
              actualSize: slice.size,
              success: slice.size === (pos.end - pos.start)
            })
          } catch (error) {
            console.error(`[BatchUpload] Failed to read ${pos.label}:`, error)
          }
        })
      }
    }

    // Validate file sizes - warn if suspiciously small
    files.forEach((file, index) => {
      // Check if file name suggests video but size is too small
      const isVideo = file.type.startsWith('video/') ||
                      file.name.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm)$/)

      console.log(`[BatchUpload] File ${index} validation:`, {
        name: file.name,
        isVideo,
        size: file.size,
        sizeInMB: (file.size / (1024 * 1024)).toFixed(2),
        type: file.type,
        fileObject: file
      })

      if (isVideo && file.size < 1024 * 1024) { // Less than 1MB for a video is suspicious
        console.error(`[BatchUpload] WARNING: Video file "${file.name}" is suspiciously small: ${formatFileSize(file.size)}`)
        alert(`Warning: Video file "${file.name}" appears truncated (only ${formatFileSize(file.size)}). Please try selecting the file again.`)
      }

      // Additional check for expected size
      if (file.name.toLowerCase().includes('100mb') || file.name.toLowerCase().includes('100 mb')) {
        const expectedSize = 100 * 1024 * 1024
        const actualSize = file.size
        const ratio = actualSize / expectedSize
        console.warn(`[BatchUpload] File name suggests 100MB but size is ${formatFileSize(actualSize)} (${(ratio * 100).toFixed(1)}% of expected)`)
      }
    })

    const groups = categorizeFiles(files)

    console.log('[BatchUpload] Files categorized:', {
      instant: groups.instant.length,
      medium: groups.medium.length,
      manual: groups.manual.length,
      totalSize: formatFileSize(files.reduce((sum, f) => sum + f.size, 0)),
      files: files.map(f => ({ name: f.name, size: formatFileSize(f.size) }))
    })

    // Create status entries for all files
    const statuses: FileUploadStatus[] = [
      ...groups.instant.map(f => ({
        file: f,
        status: 'pending' as const,
        progress: 0
      })),
      ...groups.medium.map(f => ({
        file: f,
        status: 'pending' as const,
        progress: 0
      })),
      ...groups.manual.map(f => ({
        file: f,
        status: 'too-large' as const,
        progress: 0
      }))
    ]

    setFileStatuses(statuses)

    // Show manual instructions if there are large files
    if (groups.manual.length > 0) {
      setShowManualInstructions(true)
    }

    // Start processing the queue
    if (groups.instant.length > 0 || groups.medium.length > 0) {
      console.log('[BatchUpload] Starting upload queue')
      setCurrentUploadIndex(0)
    }
  }

  // Upload instant files (< 4.5 MB)
  const uploadInstantFile = async (file: File, index: number) => {
    console.log('[BatchUpload] Uploading instant file:', {
      name: file.name,
      size: formatFileSize(file.size),
      type: file.type
    })

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      })

      if (!response) {
        throw new Error('Network error: Unable to connect to server')
      }

      let data
      try {
        data = await response.json()
      } catch (jsonError) {
        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`)
        }
        throw new Error('Invalid response from server')
      }

      if (!response.ok) {
        throw new Error(data.error || `Upload failed with status ${response.status}`)
      }

      console.log('[BatchUpload] Instant file uploaded successfully:', data.file?.id)

      setFileStatuses(prev => prev.map((s, i) =>
        i === index ? { ...s, status: 'completed', progress: 100, result: data.file } : s
      ))

      return true
    } catch (error) {
      let errorMessage = 'Upload failed'
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Network error: Unable to connect to server'
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      console.error('[BatchUpload] Upload error:', error)

      setFileStatuses(prev => prev.map((s, i) =>
        i === index ? {
          ...s,
          status: 'failed',
          error: errorMessage
        } : s
      ))
      return false
    }
  }

  // Process upload queue
  useEffect(() => {
    if (currentUploadIndex === null || currentUploadIndex >= fileStatuses.length) {
      if (currentUploadIndex !== null && currentUploadIndex >= fileStatuses.length) {
        // Check if all uploads are actually complete (not just reaching end of queue)
        const allProcessed = fileStatuses.every(f =>
          f.status === 'completed' || f.status === 'failed' || f.status === 'too-large'
        )

        if (allProcessed && fileStatuses.length > 0) {
          console.log('[BatchUpload] All files processed, calling onUploadComplete')
          setCurrentUploadIndex(null)
          onUploadComplete?.()
        } else {
          setCurrentUploadIndex(null)
        }
      }
      return
    }

    const currentFile = fileStatuses[currentUploadIndex]

    // Skip if too large or already processed
    if (currentFile.status !== 'pending') {
      setCurrentUploadIndex(currentUploadIndex + 1)
      return
    }

    // Update status to uploading
    setFileStatuses(prev => prev.map((s, i) =>
      i === currentUploadIndex ? { ...s, status: 'uploading' } : s
    ))

    // Upload based on file size
    if (currentFile.file.size <= INSTANT_LIMIT) {
      uploadInstantFile(currentFile.file, currentUploadIndex).then(() => {
        setCurrentUploadIndex(currentUploadIndex + 1)
      })
    } else if (currentFile.file.size <= MEDIUM_LIMIT) {
      // Medium files need to advance the queue too!
      // The LargeFileUpload component will handle the actual upload
      // We just need to mark that we've started processing this file
      // The queue will advance when LargeFileUpload calls onComplete or onError
      console.log(`[BatchUpload] Processing medium file: ${currentFile.file.name}`)
      // Don't advance here - let the LargeFileUpload component callbacks handle it
    }
    // Files > MEDIUM_LIMIT are marked as too-large and skipped
  }, [currentUploadIndex, fileStatuses, onUploadComplete])

  // Calculate overall progress
  const overallProgress = () => {
    if (fileStatuses.length === 0) return 0
    const uploadableFiles = fileStatuses.filter(f => f.status !== 'too-large')
    if (uploadableFiles.length === 0) return 0

    const totalProgress = uploadableFiles.reduce((sum, f) => sum + f.progress, 0)
    return totalProgress / uploadableFiles.length
  }

  // Get counts by status
  const counts = {
    instant: fileStatuses.filter(f => f.file.size <= INSTANT_LIMIT).length,
    medium: fileStatuses.filter(f => f.file.size > INSTANT_LIMIT && f.file.size <= MEDIUM_LIMIT).length,
    manual: fileStatuses.filter(f => f.file.size > MEDIUM_LIMIT).length,
    completed: fileStatuses.filter(f => f.status === 'completed').length,
    failed: fileStatuses.filter(f => f.status === 'failed').length
  }

  const getDriveFolderUrl = () => {
    // This should come from the user's actual folder ID
    if (userFolderId) {
      return `https://drive.google.com/drive/folders/${userFolderId}`
    }
    return 'https://drive.google.com/drive/my-drive'
  }

  return (
    <div className="w-full space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
          ${isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
          }
          ${fileStatuses.length > 0 && currentUploadIndex !== null ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="space-y-2">
          <div className="text-4xl">📁</div>
          <p className="text-lg font-medium">
            {isDragging ? 'Drop files here' : 'Click or drag files to upload'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Supports multiple files • Auto-handles up to 500 MB per file
          </p>
        </div>
      </div>

      {/* File Status List */}
      {fileStatuses.length > 0 && (
        <div className="space-y-4">
          {/* Overall Progress */}
          {counts.instant + counts.medium > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">
                  Overall Progress: {counts.completed} of {counts.instant + counts.medium} files
                </span>
                <span className="text-sm">
                  {Math.round(overallProgress())}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${overallProgress()}%` }}
                />
              </div>
            </div>
          )}

          {/* Ready to Upload */}
          {counts.instant > 0 && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <h3 className="font-medium mb-2">
                ✅ Quick Upload ({counts.instant} files)
              </h3>
              <div className="space-y-1 text-sm">
                {fileStatuses
                  .filter(f => f.file.size <= INSTANT_LIMIT)
                  .map((f, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between">
                        <span className="truncate flex-1">
                          {f.status === 'completed' && '✅ '}
                          {f.status === 'uploading' && '⏳ '}
                          {f.status === 'failed' && '❌ '}
                          {f.status === 'pending' && '⏸ '}
                          {f.file.name} ({formatFileSize(f.file.size)})
                        </span>
                        {f.status === 'uploading' && (
                          <span className="text-xs">{f.progress}%</span>
                        )}
                      </div>
                      {f.status === 'failed' && f.error && (
                        <div className="text-xs text-red-600 dark:text-red-400 mt-1 ml-6">
                          {f.error}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Medium Files */}
          {counts.medium > 0 && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <h3 className="font-medium mb-2">
                ⏳ Large Files - Slower Upload ({counts.medium} files)
              </h3>
              <div className="space-y-2">
                {fileStatuses
                  .filter(f => f.file.size > INSTANT_LIMIT && f.file.size <= MEDIUM_LIMIT)
                  .map((f, i) => (
                    <div key={i}>
                      {f.status === 'uploading' && currentUploadIndex === fileStatuses.indexOf(f) && (
                        <LargeFileUpload
                          file={f.file}
                          onProgress={(progress) => {
                            setFileStatuses(prev => prev.map((s, idx) =>
                              idx === fileStatuses.indexOf(f)
                                ? { ...s, progress }
                                : s
                            ))
                          }}
                          onComplete={(file) => {
                            setFileStatuses(prev => prev.map((s, idx) =>
                              idx === fileStatuses.indexOf(f)
                                ? { ...s, status: 'completed', progress: 100, result: file }
                                : s
                            ))
                            setCurrentUploadIndex((currentUploadIndex || 0) + 1)
                          }}
                          onError={(error) => {
                            setFileStatuses(prev => prev.map((s, idx) =>
                              idx === fileStatuses.indexOf(f)
                                ? { ...s, status: 'failed', error }
                                : s
                            ))
                            setCurrentUploadIndex((currentUploadIndex || 0) + 1)
                          }}
                        />
                      )}
                      {f.status !== 'uploading' && (
                        <div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate flex-1">
                              {f.status === 'completed' && '✅ '}
                              {f.status === 'failed' && '❌ '}
                              {f.status === 'pending' && '⏸ '}
                              {f.file.name} ({formatFileSize(f.file.size)})
                            </span>
                          </div>
                          {f.status === 'failed' && f.error && (
                            <div className="text-xs text-red-600 dark:text-red-400 mt-1 ml-6">
                              {f.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Manual Upload Required */}
          {counts.manual > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <h3 className="font-medium mb-2 text-red-700 dark:text-red-400">
                🔗 Too Large - Manual Upload Required ({counts.manual} files)
              </h3>
              <div className="space-y-2">
                <div className="space-y-1 text-sm">
                  {fileStatuses
                    .filter(f => f.file.size > MEDIUM_LIMIT)
                    .map((f, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="truncate flex-1">
                          ❌ {f.file.name} ({formatFileSize(f.file.size)})
                        </span>
                      </div>
                    ))}
                </div>

                <div className="mt-4 p-3 bg-white dark:bg-gray-800 rounded border border-red-200 dark:border-red-800">
                  <p className="text-sm font-medium mb-2">📋 Instructions:</p>
                  <ol className="text-sm space-y-1 list-decimal list-inside">
                    <li>Click the button below to open your Google Drive folder</li>
                    <li>Drag the large files directly into the Drive window</li>
                    <li>Wait for Google Drive to finish uploading</li>
                    <li>Return here and click "Refresh" when done</li>
                  </ol>
                  <div className="flex gap-2 mt-3">
                    <a
                      href={getDriveFolderUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      Open Google Drive Folder →
                    </a>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                    >
                      Refresh When Done
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}