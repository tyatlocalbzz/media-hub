import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth-service-account'
import { driveService } from '@/lib/services/drive-service-account'
import prisma from '@/lib/prisma'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.user) {
      console.error('[CONFIRM-UPLOAD] ❌ Authentication failed')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { sessionUri, fileName, fileSize, mimeType } = body

    if (!sessionUri || !fileName) {
      console.error('[CONFIRM-UPLOAD] ❌ Missing required fields')
      return NextResponse.json(
        { error: 'Missing required fields: sessionUri, fileName' },
        { status: 400 }
      )
    }

    console.log('[CONFIRM-UPLOAD] 🔍 Starting upload confirmation:', {
      fileName,
      expectedSize: fileSize,
      mimeType,
      userId: authResult.user.id,
      sessionUriLength: sessionUri.length,
      timestamp: new Date().toISOString()
    })

    // Initialize drive service
    const authClient = await driveService.getAuthClient()
    const drive = google.drive({ version: 'v3', auth: authClient })

    // Query the upload status to get the file ID
    // Send an empty PUT with Content-Range: bytes */fileSize to get status
    console.log('[CONFIRM-UPLOAD] 📡 Querying upload status from Google Drive...')

    const statusResponse = await authClient.request({
      url: sessionUri,
      method: 'PUT',
      headers: {
        'Content-Range': `bytes */${fileSize || '*'}`
      }
    }).catch((error: any) => {
      // If we get a 200 or 201, the upload is complete
      if (error.response?.status === 200 || error.response?.status === 201) {
        console.log('[CONFIRM-UPLOAD] ✅ Upload confirmed complete by Google Drive')
        return error.response
      }
      // If we get 308, upload is incomplete
      if (error.response?.status === 308) {
        console.error('[CONFIRM-UPLOAD] ⚠️ Upload incomplete, range:', error.response?.headers?.range)
        throw new Error('Upload is incomplete. Please continue uploading.')
      }
      console.error('[CONFIRM-UPLOAD] ❌ Status query failed:', error.response?.status, error.message)
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
    console.log('[CONFIRM-UPLOAD] 📊 Fetching file metadata from Google Drive...')

    const fileResponse = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, size, mimeType, webViewLink, thumbnailLink, createdTime, modifiedTime',
      supportsAllDrives: true
    })

    const driveFile = fileResponse.data

    console.log('[CONFIRM-UPLOAD] 📁 Google Drive file details:', {
      driveFileId: driveFile.id,
      fileName: driveFile.name,
      actualSize: driveFile.size,
      expectedSize: fileSize,
      sizeMismatch: fileSize && driveFile.size ? Math.abs(Number(driveFile.size) - fileSize) > 1000 : false,
      mimeType: driveFile.mimeType,
      hasWebLink: !!driveFile.webViewLink,
      hasThumbnail: !!driveFile.thumbnailLink
    })

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

    const totalTime = Date.now() - startTime

    console.log('[CONFIRM-UPLOAD] ✅ Upload confirmed and saved to database:', {
      fileId: file.id,
      driveFileId: file.driveFileId,
      name: file.name,
      size: file.size?.toString(),
      sizeInMB: file.size ? `${(Number(file.size) / (1024 * 1024)).toFixed(2)} MB` : 'N/A',
      confirmationTime: `${totalTime}ms`,
      timestamp: new Date().toISOString()
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