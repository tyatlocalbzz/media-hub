// Type definitions for Phase 2: Media Processing

export interface MediaFile {
  id: string
  name: string
  mimeType: string
  size: number
  driveFileId: string
  driveUrl?: string
  thumbnailUrl?: string
  duration?: number // in seconds
  status: FileStatus
  transcript?: string
  error?: string
  userId: string
  createdAt: Date
  updatedAt: Date
  processedAt?: Date
}

export type FileStatus = 'new' | 'processing' | 'completed' | 'error'

export interface ProcessingJob {
  id: string
  fileId: string
  type: JobType
  status: JobStatus
  startedAt: Date
  completedAt?: Date
  error?: string
  progress?: number // 0-100
  metadata?: Record<string, any>
}

export type JobType = 'transcription' | 'export' | 'move'
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface TranscriptSegment {
  start: number // Start time in seconds
  end: number   // End time in seconds
  text: string
  confidence?: number
  speaker?: string
}

export interface Transcript {
  id: string
  fileId: string
  content: string
  segments?: TranscriptSegment[]
  language?: string
  duration?: number
  createdAt: Date
  updatedAt: Date
}

export interface ExportOptions {
  format: 'txt' | 'srt' | 'vtt' | 'json'
  includeTimestamps?: boolean
  includeSpeakers?: boolean
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  createdTime?: string
  modifiedTime?: string
  webViewLink?: string
  webContentLink?: string
  thumbnailLink?: string
}

export interface SyncResult {
  added: number
  updated: number
  errors: string[]
  files: MediaFile[]
}

export interface ProcessingOptions {
  priority?: 'low' | 'normal' | 'high'
  language?: string
  model?: 'whisper-1' | 'whisper-large' // OpenAI models
  enhanceAudio?: boolean
  speakerDiarization?: boolean
}