'use client'

import { useState } from 'react'
import { formatFileSize, formatDuration } from '@/lib/utils'
import { FileListSkeleton } from './FileListSkeleton'

interface FileData {
  id: string
  name: string
  mimeType: string | null
  size: string | null
  duration: number | null
  status: 'NEW' | 'TRANSCRIBING' | 'READY'
  thumbnailUrl: string | null
  driveUrl: string | null
  createdAt: string
  lastSyncedAt: string | null
  isDeleted: boolean
}

interface FileListProps {
  files: FileData[]
  onDelete?: (fileId: string) => void
  onProcess?: (fileId: string) => void
  loading?: boolean
}

export function FileList({ files, onDelete, onProcess, loading }: FileListProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())

  const toggleFileSelection = (fileId: string) => {
    const newSelection = new Set(selectedFiles)
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId)
    } else {
      newSelection.add(fileId)
    }
    setSelectedFiles(newSelection)
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      NEW: 'bg-blue-100 text-blue-800',
      TRANSCRIBING: 'bg-yellow-100 text-yellow-800',
      READY: 'bg-green-100 text-green-800'
    }
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800'
  }

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return '📄'
    if (mimeType.startsWith('video/')) return '🎬'
    if (mimeType.startsWith('audio/')) return '🎵'
    return '📄'
  }

  if (loading) {
    return <FileListSkeleton count={6} />
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📁</div>
        <p className="text-gray-600 mb-2">No files found</p>
        <p className="text-sm text-gray-500">
          Upload media files to your Google Drive or sync to see them here
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <div
          key={file.id}
          className={`
            relative bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow
            ${selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : 'border-gray-200'}
          `}
        >
          {/* Thumbnail or Icon */}
          <div className="aspect-video bg-gray-100 rounded-t-lg flex items-center justify-center">
            {file.thumbnailUrl ? (
              <img
                src={file.thumbnailUrl}
                alt={file.name}
                className="w-full h-full object-cover rounded-t-lg"
              />
            ) : (
              <div className="text-4xl">{getFileIcon(file.mimeType)}</div>
            )}
          </div>

          {/* File Info */}
          <div className="p-4">
            {/* Title and Checkbox */}
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-900 line-clamp-2 flex-1">
                {file.name}
              </h3>
              <input
                type="checkbox"
                checked={selectedFiles.has(file.id)}
                onChange={() => toggleFileSelection(file.id)}
                className="ml-2 mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>

            {/* Metadata */}
            <div className="space-y-1 mb-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{file.size ? formatFileSize(Number(file.size)) : 'Unknown size'}</span>
                {file.duration && <span>{formatDuration(file.duration)}</span>}
              </div>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(file.status)}`}>
                  {file.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(file.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {file.driveUrl && (
                <a
                  href={file.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                >
                  View in Drive
                </a>
              )}

              {file.status === 'NEW' && onProcess && (
                <button
                  onClick={() => onProcess(file.id)}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                >
                  Transcribe
                </button>
              )}

              {file.status === 'READY' && (
                <button
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
                >
                  View Transcript
                </button>
              )}

              {onDelete && (
                <button
                  onClick={() => onDelete(file.id)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center gap-1"
                >
                  🗑️ Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}