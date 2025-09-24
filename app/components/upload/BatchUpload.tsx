'use client'

import { useState, useRef, DragEvent, useEffect } from 'react'
import { formatFileSize } from '@/lib/utils'
import { LargeFileUpload } from './LargeFileUpload'
import { DirectUpload } from './DirectUpload'
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
const INSTANT_LIMIT = 4.5 * 1024 * 1024      // 4.5 MB - Direct to GCS (zero bandwidth)
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

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFiles(files)
    }
  }

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFiles(Array.from(files))
    }
  }

  // Process selected files
  const handleFiles = (files: File[]) => {
    const groups = categorizeFiles(files)

    console.log('[BatchUpload] Files categorized:', {
      instant: groups.instant.length,
      medium: groups.medium.length,
      manual: groups.manual.length,
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

  // Upload instant files (< 4.5 MB) - Now uses zero-bandwidth direct upload
  const uploadInstantFile = async (file: File, index: number) => {
    // This function is now just a placeholder for the DirectUpload component
    // The actual upload is handled by DirectUpload
    console.log('[BatchUpload] Instant file will be uploaded via DirectUpload:', file.name)
    return true
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
      // For instant files, DirectUpload component handles everything
      // We just need to mark that we're processing this file
      console.log(`[BatchUpload] Processing instant file: ${currentFile.file.name}`)
      // The queue advancement is handled by DirectUpload callbacks
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
                      {f.status === 'uploading' && currentUploadIndex === fileStatuses.indexOf(f) && (
                        <div className="mt-2">
                          <DirectUpload
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