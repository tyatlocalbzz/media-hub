// Google Drive API service for Media Hub
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import prisma from '@/lib/prisma'
import { config } from '@/lib/config'

// Type definitions
export interface DriveFile {
  id: string
  name: string
  mimeType: string
  type: 'video' | 'audio' | 'unknown'
  size: number
  sizeFormatted: string
  thumbnailUrl?: string
  webViewLink?: string
  createdTime: string
  modifiedTime: string
  duration?: number
  durationFormatted?: string
}

// Helper functions
export function formatFileSize(bytes: number | string | null | undefined): string {
  if (!bytes) return '0 B'

  const size = typeof bytes === 'string' ? parseInt(bytes) : bytes
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.floor(Math.log(size) / Math.log(1024))

  return `${(size / Math.pow(1024, index)).toFixed(2)} ${units[index]}`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return ''

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function isMediaFile(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return config.drive.supportedMimeTypes.includes(mimeType)
}

export function getFileType(mimeType: string | null | undefined): 'video' | 'audio' | 'unknown' {
  if (!mimeType) return 'unknown'

  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'unknown'
}

// Initialize OAuth2 client
function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/callback`
  )
}

// Get authenticated Drive client for user
export async function getDriveClient(userId: string) {
  const oauth2Client = createOAuth2Client()

  // Get user's refresh token from database
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      refresh_token: true,
      incoming_folder_id: true,
      drive_folder_id: true
    }
  })

  if (!user?.refresh_token) {
    throw new Error('No refresh token found for user')
  }

  // Set credentials
  oauth2Client.setCredentials({
    refresh_token: user.refresh_token
  })

  // Create Drive client
  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  return { drive, folderIds: user }
}

// List files from user's Incoming folder
export async function listFiles(userId: string) {
  try {
    const { drive, folderIds } = await getDriveClient(userId)

    if (!folderIds.incoming_folder_id) {
      return {
        success: false,
        error: 'No Incoming folder found for user',
        files: []
      }
    }

    // List files in the Incoming folder with enhanced metadata
    const response = await drive.files.list({
      q: `'${folderIds.incoming_folder_id}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, thumbnailLink, webViewLink, videoMediaMetadata, owners)',
      orderBy: 'createdTime desc',
      pageSize: 100
    })

    const allFiles = response.data.files || []

    // Filter for supported media files and transform data
    const mediaFiles: DriveFile[] = allFiles
      .filter(file => isMediaFile(file.mimeType))
      .map(file => {
        const duration = file.videoMediaMetadata?.durationMillis
          ? Math.floor(parseInt(file.videoMediaMetadata.durationMillis) / 1000)
          : undefined

        return {
          id: file.id || '',
          name: file.name || 'Untitled',
          mimeType: file.mimeType || 'application/octet-stream',
          type: getFileType(file.mimeType),
          size: file.size ? parseInt(file.size) : 0,
          sizeFormatted: formatFileSize(file.size),
          thumbnailUrl: file.thumbnailLink || undefined,
          webViewLink: file.webViewLink || undefined,
          createdTime: file.createdTime || new Date().toISOString(),
          modifiedTime: file.modifiedTime || new Date().toISOString(),
          duration,
          durationFormatted: formatDuration(duration)
        }
      })

    return {
      success: true,
      files: mediaFiles,
      stats: {
        totalFiles: allFiles.length,
        mediaFiles: mediaFiles.length,
        videoFiles: mediaFiles.filter(f => f.type === 'video').length,
        audioFiles: mediaFiles.filter(f => f.type === 'audio').length,
        totalSize: mediaFiles.reduce((acc, file) => acc + file.size, 0),
        totalSizeFormatted: formatFileSize(mediaFiles.reduce((acc, file) => acc + file.size, 0))
      },
      folderId: folderIds.incoming_folder_id
    }

  } catch (error) {
    console.error('Error listing files from Drive:', error)

    // Check if it's an auth error
    if (error instanceof Error && error.message.includes('invalid_grant')) {
      return {
        success: false,
        error: 'Authentication expired. Please sign in again.',
        files: []
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list files',
      files: []
    }
  }
}

// Test connection to Drive API
export async function testDriveConnection(userId: string) {
  try {
    const { drive } = await getDriveClient(userId)

    // Try to get Drive about info to test connection
    const about = await drive.about.get({
      fields: 'user(displayName, emailAddress), storageQuota'
    })

    return {
      success: true,
      user: about.data.user,
      storageQuota: about.data.storageQuota
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Drive'
    }
  }
}

// Permanently delete a file from Google Drive
export async function deleteFileFromDrive(userId: string, driveFileId: string) {
  try {
    const { drive } = await getDriveClient(userId)

    // Permanently delete the file from Google Drive
    await drive.files.delete({
      fileId: driveFileId
    })

    return {
      success: true,
      message: 'File permanently deleted from Google Drive'
    }

  } catch (error) {
    console.error('Error deleting file from Drive:', error)

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('File not found')) {
        return {
          success: false,
          error: 'File not found in Google Drive'
        }
      }
      if (error.message.includes('Insufficient permissions')) {
        return {
          success: false,
          error: 'Insufficient permissions to delete this file'
        }
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete file from Drive'
    }
  }
}