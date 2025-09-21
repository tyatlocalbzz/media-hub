// Types for upload components

export interface UploadedFile {
  id: string
  name: string
  size: number
  mimeType?: string
  webViewLink?: string
  thumbnailLink?: string
}

export interface UploadComponentProps {
  onUploadComplete?: (file?: UploadedFile) => void
  onError?: (error: Error) => void
  maxFileSize?: number
  supportedTypes?: string[]
}

export interface ClientUploadProps extends UploadComponentProps {
  file?: File
}

export interface UploadProgress {
  bytesUploaded: number
  totalBytes: number
  percentage: number
}

export interface UploadSession {
  sessionUrl: string
  accessToken: string
  folderId: string
  userId: string
  maxChunkSize: number
}

export interface FileMetadata {
  userId: string
  driveFileId: string
  name: string
  mimeType: string
  size: number
  driveUrl?: string
  thumbnailUrl?: string
  duration?: number
}