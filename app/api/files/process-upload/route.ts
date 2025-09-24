import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth-service-account'
import { gcsService } from '@/lib/services/gcs-service'
import { driveService } from '@/lib/services/drive-service-account'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { bucketName, fileKey, fileName, fileSize, mimeType } = body

    // Validate inputs
    if (!bucketName || !fileKey || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: bucketName, fileKey, fileName' },
        { status: 400 }
      )
    }

    console.log('[PROCESS-UPLOAD] Processing file from GCS:', {
      bucketName,
      fileKey,
      fileName,
      userId: authResult.user.id
    })

    // Step 1: Check if file exists in GCS
    const fileExists = await gcsService.fileExists(bucketName, fileKey)
    if (!fileExists) {
      return NextResponse.json(
        { error: 'File not found in storage' },
        { status: 404 }
      )
    }

    // Step 2: Get or create user's Incoming folder in Google Drive
    const userFolderId = await driveService.getOrCreateUserFolder(authResult.user.id)

    // Step 3: Stream file from GCS to Google Drive
    const drive = await driveService.getDriveClient()

    // Create a read stream from GCS
    const readStream = gcsService.createReadStream(bucketName, fileKey)

    // Upload to Google Drive
    const driveResponse = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [userFolderId],
        mimeType: mimeType || 'application/octet-stream'
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: readStream
      },
      supportsAllDrives: true,
      fields: 'id, name, mimeType, size, webViewLink, thumbnailLink, createdTime, modifiedTime'
    })

    if (!driveResponse.data.id) {
      throw new Error('Failed to upload file to Google Drive')
    }

    console.log('[PROCESS-UPLOAD] File uploaded to Drive:', driveResponse.data.id)

    // Step 4: Create database record
    const file = await prisma.file.create({
      data: {
        driveFileId: driveResponse.data.id,
        name: fileName,
        mimeType: mimeType || 'application/octet-stream',
        size: fileSize || (driveResponse.data.size ? BigInt(driveResponse.data.size) : BigInt(0)),
        userId: authResult.user.id,
        driveUrl: driveResponse.data.webViewLink || null,
        thumbnailUrl: driveResponse.data.thumbnailLink || null,
        driveModifiedTime: driveResponse.data.modifiedTime ? new Date(driveResponse.data.modifiedTime) : null,
        status: 'NEW'
      }
    })

    console.log('[PROCESS-UPLOAD] Database record created:', file.id)

    // Step 5: Delete file from GCS (cleanup)
    try {
      await gcsService.deleteFile(bucketName, fileKey)
      console.log('[PROCESS-UPLOAD] Deleted temporary file from GCS')
    } catch (deleteError) {
      console.error('[PROCESS-UPLOAD] Failed to delete GCS file:', deleteError)
      // Don't fail the request if cleanup fails
    }

    return NextResponse.json({
      success: true,
      file: {
        id: file.id,
        driveFileId: file.driveFileId,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size.toString(),
        driveUrl: file.driveUrl,
        thumbnailUrl: file.thumbnailUrl
      }
    })
  } catch (error) {
    console.error('[PROCESS-UPLOAD] Error:', error)

    // Try to clean up GCS file if something failed
    const { bucketName, fileKey } = await request.json().catch(() => ({ bucketName: null, fileKey: null }))
    if (bucketName && fileKey) {
      try {
        await gcsService.deleteFile(bucketName, fileKey)
      } catch (cleanupError) {
        console.error('[PROCESS-UPLOAD] Cleanup failed:', cleanupError)
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process upload'
      },
      { status: 500 }
    )
  }
}

// Set a longer timeout for this endpoint since it handles file transfers
export const maxDuration = 60 // 60 seconds