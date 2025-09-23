'use client'

import { BatchUpload } from './BatchUpload'
import type { UploadComponentProps } from './types'

export function SmartFileUpload({ onUploadComplete, userFolderId }: UploadComponentProps) {
  return <BatchUpload onUploadComplete={onUploadComplete} userFolderId={userFolderId} />
}