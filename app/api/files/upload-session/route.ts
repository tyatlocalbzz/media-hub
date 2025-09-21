// Generate upload session for client-side direct uploads to Google Drive
import { NextRequest, NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { requireAuthWithDrive } from '@/lib/middleware/auth'
import prisma from '@/lib/prisma'

// This endpoint creates an upload session and returns credentials for client-side upload
export async function POST(request: NextRequest) {
  console.log('[UPLOAD-SESSION] Creating upload session for client-side upload')

  try {
    // Check authentication and get Drive config
    const authResult = await requireAuthWithDrive(request)
    if (!authResult.success) {
      return authResult.response
    }

    // TypeScript needs explicit type check
    if (!('driveConfig' in authResult) || !('oauth2Client' in authResult)) {
      return NextResponse.json(
        { error: 'Drive configuration error' },
        { status: 500 }
      )
    }

    const { user, driveConfig, oauth2Client } = authResult

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      )
    }

    // Get file metadata from request
    const body = await request.json()
    const { fileName, fileSize, mimeType } = body

    if (!fileName || !fileSize || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: fileName, fileSize, mimeType' },
        { status: 400 }
      )
    }

    console.log('[UPLOAD-SESSION] File details:', {
      name: fileName,
      size: fileSize,
      type: mimeType,
      sizeMB: (fileSize / 1024 / 1024).toFixed(2)
    })

    // Create a hash of the file to check for duplicates (for future use)
    // const fileHash = crypto
    //   .createHash('md5')
    //   .update(`${user.id}-${fileName}-${fileSize}`)
    //   .digest('hex')

    // Check if this exact file was recently uploaded by this user
    const recentFile = await prisma.file.findFirst({
      where: {
        userId: user.id,
        name: fileName,
        size: BigInt(fileSize),
        createdAt: {
          // Check files uploaded in last 10 minutes
          gte: new Date(Date.now() - 10 * 60 * 1000)
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (recentFile) {
      console.log('[UPLOAD-SESSION] File recently uploaded, returning existing:', recentFile.driveFileId)
      return NextResponse.json({
        success: true,
        duplicate: true,
        file: {
          id: recentFile.driveFileId,
          name: recentFile.name,
          size: recentFile.size?.toString(),
          mimeType: recentFile.mimeType,
          webViewLink: recentFile.driveUrl,
          thumbnailLink: recentFile.thumbnailUrl
        },
        message: 'File already uploaded recently'
      })
    }

    // Validate file type
    if (!config.drive.supportedMimeTypes.includes(mimeType)) {
      return NextResponse.json(
        {
          error: 'Unsupported file type',
          supportedTypes: config.drive.supportedMimeTypes,
          receivedType: mimeType
        },
        { status: 400 }
      )
    }

    // Validate file size
    if (fileSize > config.drive.maxFileSize) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${config.drive.maxFileSize / (1024 * 1024 * 1024)}GB`,
          fileSize: fileSize
        },
        { status: 400 }
      )
    }

    // Get fresh access token
    const { token } = await oauth2Client.getAccessToken()
    if (!token) {
      return NextResponse.json(
        { error: 'Failed to get access token' },
        { status: 401 }
      )
    }

    console.log('[UPLOAD-SESSION] Initiating resumable upload session with Google Drive')

    // Create resumable upload session with Google Drive
    const initiateResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mimeType,
          'X-Upload-Content-Length': fileSize.toString()
        },
        body: JSON.stringify({
          name: fileName,
          parents: [driveConfig.incomingFolderId],
          mimeType: mimeType
        })
      }
    )

    if (!initiateResponse.ok) {
      const errorText = await initiateResponse.text()
      console.error('[UPLOAD-SESSION] Failed to initiate resumable upload:', errorText)
      return NextResponse.json(
        { error: 'Failed to create upload session', details: errorText },
        { status: initiateResponse.status }
      )
    }

    // Get the upload session URL
    const sessionUrl = initiateResponse.headers.get('Location')
    if (!sessionUrl) {
      return NextResponse.json(
        { error: 'No upload session URL returned from Google Drive' },
        { status: 500 }
      )
    }

    console.log('[UPLOAD-SESSION] Upload session created successfully')

    // Return session details for client-side upload
    return NextResponse.json({
      success: true,
      sessionUrl: sessionUrl,
      accessToken: token, // Client needs this to authenticate uploads
      folderId: driveConfig.incomingFolderId,
      userId: user.id,
      maxChunkSize: 256 * 1024 * 1024, // 256MB chunks recommended
      message: 'Upload session created. Use the session URL and token to upload from client.'
    })

  } catch (error: any) {
    console.error('[UPLOAD-SESSION] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to create upload session',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET endpoint to check upload status (optional)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionUrl = searchParams.get('sessionUrl')

  if (!sessionUrl) {
    return NextResponse.json(
      { error: 'Missing sessionUrl parameter' },
      { status: 400 }
    )
  }

  try {
    // Check authentication and get Drive config
    const authResult = await requireAuthWithDrive(request)
    if (!authResult.success) {
      return authResult.response
    }

    // TypeScript needs explicit type check
    if (!('oauth2Client' in authResult)) {
      return NextResponse.json(
        { error: 'Drive configuration error' },
        { status: 500 }
      )
    }

    const { oauth2Client } = authResult

    if (!oauth2Client) {
      return NextResponse.json(
        { error: 'OAuth client error' },
        { status: 500 }
      )
    }

    // Get access token
    const { token } = await oauth2Client.getAccessToken()
    if (!token) {
      return NextResponse.json(
        { error: 'Failed to get access token' },
        { status: 401 }
      )
    }

    // Query upload status
    const statusResponse = await fetch(sessionUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Range': 'bytes */*' // Query current upload status
      }
    })

    if (statusResponse.status === 308) {
      // Upload in progress
      const range = statusResponse.headers.get('Range')
      const bytesReceived = range ? parseInt(range.split('-')[1]) + 1 : 0

      return NextResponse.json({
        status: 'in_progress',
        bytesUploaded: bytesReceived,
        nextByte: bytesReceived
      })
    } else if (statusResponse.ok) {
      // Upload complete
      const fileData = await statusResponse.json()
      return NextResponse.json({
        status: 'complete',
        file: fileData
      })
    } else {
      // Error or unknown status
      return NextResponse.json({
        status: 'error',
        details: await statusResponse.text()
      })
    }

  } catch (error: any) {
    console.error('[UPLOAD-SESSION] Status check error:', error)
    return NextResponse.json(
      {
        error: 'Failed to check upload status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}