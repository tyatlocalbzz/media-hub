import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth-service-account'
import { driveService } from '@/lib/services/drive-service-account'
import prisma from '@/lib/prisma'
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
    const { sessionUri, fileName, fileSize, mimeType } = body

    if (!sessionUri || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionUri, fileName' },
        { status: 400 }
      )
    }

    console.log('[CONFIRM-UPLOAD] Confirming upload for:', {
      fileName,
      userId: authResult.user.id
    })

    // Initialize drive service
    const authClient = await driveService.getAuthClient()
    const drive = google.drive({ version: 'v3', auth: authClient })

    // Query the upload status to get the file ID
    // Send an empty PUT with Content-Range: bytes */fileSize to get status
    const statusResponse = await authClient.request({
      url: sessionUri,
      method: 'PUT',
      headers: {
        'Content-Range': `bytes */${fileSize || '*'}`
      }
    }).catch((error: any) => {
      // If we get a 200 or 201, the upload is complete
      if (error.response?.status === 200 || error.response?.status === 201) {
        return error.response
      }
      // If we get 308, upload is incomplete
      if (error.response?.status === 308) {
        throw new Error('Upload is incomplete. Please continue uploading.')
      }
      throw error
    })

    // Extract file ID from response
    let fileId: string | null = null

    if (statusResponse.data && typeof statusResponse.data === 'object' && 'id' in statusResponse.data) {
      fileId = statusResponse.data.id as string
    }

    if (!fileId) {
      // Try to find the file by name in the user's folder
      const userFolderId = await driveService.getOrCreateUserFolder(
        authResult.user.id
      )

      const searchResponse = await drive.files.list({
        q: `name='${fileName}' and '${userFolderId}' in parents and trashed=false`,
        fields: 'files(id, name, size, mimeType, webViewLink, thumbnailLink)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      })

      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        fileId = searchResponse.data.files[0].id!
      }
    }

    if (!fileId) {
      throw new Error('Could not confirm file upload. File ID not found.')
    }

    // Get file metadata from Drive
    const fileResponse = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, size, mimeType, webViewLink, thumbnailLink, createdTime, modifiedTime',
      supportsAllDrives: true
    })

    const driveFile = fileResponse.data

    // Store file metadata in database
    const file = await prisma.file.create({
      data: {
        userId: authResult.user.id,
        driveFileId: fileId,
        name: driveFile.name || fileName,
        mimeType: driveFile.mimeType || mimeType,
        size: driveFile.size ? BigInt(driveFile.size) : null,
        driveUrl: driveFile.webViewLink || null,
        thumbnailUrl: driveFile.thumbnailLink || null,
        driveModifiedTime: driveFile.modifiedTime ? new Date(driveFile.modifiedTime) : null,
        status: 'NEW'
      }
    })

    console.log('[CONFIRM-UPLOAD] Upload confirmed:', {
      fileId: file.id,
      driveFileId: file.driveFileId,
      name: file.name,
      size: file.size?.toString()
    })

    return NextResponse.json({
      success: true,
      file: {
        id: file.id,
        driveFileId: file.driveFileId,
        name: file.name,
        size: file.size?.toString(),
        mimeType: file.mimeType,
        webViewLink: file.driveUrl,
        thumbnailLink: file.thumbnailUrl,
        status: file.status
      }
    })
  } catch (error) {
    console.error('[CONFIRM-UPLOAD] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to confirm upload'
      },
      { status: 500 }
    )
  }
}