import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth-service-account'
import { driveService } from '@/lib/services/drive-service-account'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { fileName, fileSize, mimeType } = body

    // Validate inputs
    if (!fileName || !fileSize || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: fileName, fileSize, mimeType' },
        { status: 400 }
      )
    }

    // Validate file type
    const supportedTypes = [
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska',
      'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm'
    ]

    if (!supportedTypes.includes(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}` },
        { status: 400 }
      )
    }

    // Max file size: 5GB
    const maxSize = 5 * 1024 * 1024 * 1024
    if (fileSize > maxSize) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 5GB` },
        { status: 400 }
      )
    }

    console.log('[UPLOAD-SESSION] Creating resumable session for:', {
      fileName,
      fileSize,
      mimeType,
      userId: authResult.user.id
    })

    // Get or create user's folder in shared drive
    const userFolderId = await driveService.getOrCreateUserFolder(
      authResult.user.id
    )

    // Initialize drive service
    const authClient = await driveService.getAuthClient()

    // Create metadata for the file
    const fileMetadata = {
      name: fileName,
      parents: [userFolderId],
      mimeType: mimeType
    }

    // Initiate resumable upload session
    // We'll use a direct API call to get the session URI
    const response = await authClient.request({
      url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      method: 'POST',
      headers: {
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': fileSize.toString(),
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(fileMetadata)
    })

    // The session URI is in the Location header
    const sessionUri = response.headers.get('location')

    if (!sessionUri) {
      throw new Error('Failed to get upload session URI from Google Drive')
    }

    console.log('[UPLOAD-SESSION] Created session:', {
      sessionUri: sessionUri.substring(0, 50) + '...',
      userId: authResult.user.id
    })

    // Store upload metadata in database for tracking
    // We'll create the file record when upload is confirmed
    // For now, we can track it in a session or temporary table if needed

    return NextResponse.json({
      success: true,
      sessionUri,
      fileName,
      fileSize,
      mimeType,
      // Include chunk size recommendation
      recommendedChunkSize: 256 * 1024 * 10, // 2.5MB chunks
      maxChunkSize: 256 * 1024 * 20 // 5MB max chunk
    })
  } catch (error) {
    console.error('[UPLOAD-SESSION] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create upload session'
      },
      { status: 500 }
    )
  }
}