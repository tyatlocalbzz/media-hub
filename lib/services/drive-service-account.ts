// Google Drive API service using Service Account for Media Hub
import { google } from 'googleapis'
import { GoogleAuth } from 'google-auth-library'
import prisma from '@/lib/prisma'
import { config } from '@/lib/config'

// Type definitions (same as before)
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

// Helper functions (reuse existing ones)
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

// Initialize Service Account Auth
let authClient: GoogleAuth | null = null

function getAuthClient(): GoogleAuth {
  if (!authClient) {
    // Check if service account key is configured
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable not configured')
    }

    try {
      let serviceAccountKey;

      // Check if it's already JSON (for testing) or needs base64 decoding
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY.startsWith('{')) {
        // It's already JSON
        serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
        console.log('[Drive Service] Using direct JSON service account key')
      } else {
        // Try base64 decoding
        try {
          const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString()
          serviceAccountKey = JSON.parse(decoded)
          console.log('[Drive Service] Decoded base64 service account key')
        } catch (decodeError) {
          console.error('[Drive Service] Invalid service account key format. Expected base64 encoded JSON or direct JSON')
          throw new Error('Service account key must be either base64 encoded JSON or direct JSON string')
        }
      }

      authClient = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/drive']
      })

      console.log('[Drive Service] Service account initialized successfully')
    } catch (error) {
      console.error('[Drive Service] Failed to initialize service account:', error)
      throw new Error('Failed to initialize Google Drive service account')
    }
  }

  return authClient
}

// Get Drive client using service account
export async function getDriveClient() {
  const auth = getAuthClient()
  const drive = google.drive({ version: 'v3', auth })
  return drive
}

// Get or create user folder in shared drive
async function getUserFolder(userId: string): Promise<string> {
  const drive = await getDriveClient()
  const sharedDriveId = process.env.SHARED_DRIVE_ID

  // Get user email for folder name
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  })

  if (!user) {
    throw new Error('User not found')
  }

  const userFolderName = user.email.replace('@', '_at_')

  try {
    // First, check if Media Hub root folder exists
    const rootFolderName = 'Media Hub'
    let rootFolderId = process.env.MEDIA_HUB_ROOT_FOLDER_ID

    if (!rootFolderId) {
      // Search for existing root folder
      const rootSearch = await drive.files.list({
        q: `name='${rootFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(sharedDriveId ? { corpora: 'drive', driveId: sharedDriveId } : {}),
        fields: 'files(id, name)'
      })

      if (rootSearch.data.files && rootSearch.data.files.length > 0) {
        rootFolderId = rootSearch.data.files[0].id!
      } else {
        // Create root folder
        const rootFolder = await drive.files.create({
          requestBody: {
            name: rootFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: sharedDriveId ? [sharedDriveId] : undefined
          },
          supportsAllDrives: true,
          fields: 'id'
        })
        rootFolderId = rootFolder.data.id!
        console.log('[Drive Service] Created Media Hub root folder:', rootFolderId)
      }
    }

    // Search for user's folder
    const userFolderSearch = await drive.files.list({
      q: `name='${userFolderName}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      ...(sharedDriveId ? { corpora: 'drive', driveId: sharedDriveId } : {}),
      fields: 'files(id, name)'
    })

    let userFolderId: string

    if (userFolderSearch.data.files && userFolderSearch.data.files.length > 0) {
      userFolderId = userFolderSearch.data.files[0].id!
    } else {
      // Create user folder
      const userFolder = await drive.files.create({
        requestBody: {
          name: userFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId]
        },
        supportsAllDrives: true,
        fields: 'id'
      })
      userFolderId = userFolder.data.id!
      console.log('[Drive Service] Created user folder:', userFolderId)

      // Create Incoming subfolder
      await drive.files.create({
        requestBody: {
          name: 'Incoming',
          mimeType: 'application/vnd.google-apps.folder',
          parents: [userFolderId]
        },
        supportsAllDrives: true
      })

      // Create Processed subfolder
      await drive.files.create({
        requestBody: {
          name: 'Processed',
          mimeType: 'application/vnd.google-apps.folder',
          parents: [userFolderId]
        },
        supportsAllDrives: true
      })
    }

    return userFolderId
  } catch (error) {
    console.error('[Drive Service] Error managing user folder:', error)
    throw error
  }
}

// Get user's Incoming folder
async function getIncomingFolder(userId: string): Promise<string> {
  const drive = await getDriveClient()
  const userFolderId = await getUserFolder(userId)
  const sharedDriveId = process.env.SHARED_DRIVE_ID

  // Search for Incoming folder
  const incomingSearch = await drive.files.list({
    q: `name='Incoming' and '${userFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    ...(sharedDriveId ? { corpora: 'drive', driveId: sharedDriveId } : {}),
    fields: 'files(id)'
  })

  if (incomingSearch.data.files && incomingSearch.data.files.length > 0) {
    return incomingSearch.data.files[0].id!
  }

  // Create if doesn't exist
  const incomingFolder = await drive.files.create({
    requestBody: {
      name: 'Incoming',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [userFolderId]
    },
    supportsAllDrives: true,
    fields: 'id'
  })

  return incomingFolder.data.id!
}

// List files from user's Incoming folder
export async function listFiles(userId: string) {
  try {
    const drive = await getDriveClient()
    const incomingFolderId = await getIncomingFolder(userId)
    const sharedDriveId = process.env.SHARED_DRIVE_ID

    // List files in the Incoming folder with enhanced metadata
    const response = await drive.files.list({
      q: `'${incomingFolderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, thumbnailLink, webViewLink, videoMediaMetadata)',
      orderBy: 'createdTime desc',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      ...(sharedDriveId ? { corpora: 'drive', driveId: sharedDriveId } : {})
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
      folderId: incomingFolderId
    }

  } catch (error) {
    console.error('[Drive Service] Error listing files:', error)

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list files',
      files: []
    }
  }
}

// Upload file to user's Incoming folder
export async function uploadFile(userId: string, file: Buffer | Stream, metadata: {
  name: string
  mimeType: string
  size?: number
}) {
  try {
    const drive = await getDriveClient()
    const incomingFolderId = await getIncomingFolder(userId)

    const response = await drive.files.create({
      requestBody: {
        name: metadata.name,
        mimeType: metadata.mimeType,
        parents: [incomingFolderId]
      },
      media: {
        mimeType: metadata.mimeType,
        body: file
      },
      supportsAllDrives: true,
      fields: 'id, name, mimeType, size, webViewLink, thumbnailLink'
    })

    return {
      success: true,
      file: response.data
    }
  } catch (error) {
    console.error('[Drive Service] Error uploading file:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload file'
    }
  }
}

// Delete file from Drive
export async function deleteFileFromDrive(userId: string, driveFileId: string) {
  try {
    const drive = await getDriveClient()

    await drive.files.delete({
      fileId: driveFileId,
      supportsAllDrives: true
    })

    return {
      success: true,
      message: 'File deleted successfully'
    }
  } catch (error) {
    console.error('[Drive Service] Error deleting file:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete file'
    }
  }
}

// Test service account connection
export async function testDriveConnection() {
  try {
    const drive = await getDriveClient()

    // Try to get Drive about info to test connection
    const about = await drive.about.get({
      fields: 'user(displayName, emailAddress), storageQuota'
    })

    return {
      success: true,
      user: about.data.user,
      storageQuota: about.data.storageQuota,
      serviceAccount: true
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Drive'
    }
  }
}

// Stream type for TypeScript
type Stream = NodeJS.ReadableStream

// Export service functions as a single object for easier imports
export const driveService = {
  getAuthClient,
  getDriveClient,
  getOrCreateUserFolder: getUserFolder, // Alias for external use
  listFiles,
  uploadFile,
  deleteFileFromDrive,
  testDriveConnection,
  formatFileSize,
  formatDuration,
  isMediaFile,
  getFileType
}