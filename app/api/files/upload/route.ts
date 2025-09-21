// Upload files directly to Google Drive
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import prisma from '@/lib/prisma'
import { config } from '@/lib/config'
import { requireAuthWithDrive } from '@/lib/middleware/auth'
import { createLogger } from '@/lib/logger'
import { handleApiError, ValidationError, validateMimeType, validateFileSize } from '@/lib/errors'
import { serializeBigInt } from '@/lib/utils'

const logger = createLogger('UPLOAD')

// Increase timeout for large file uploads
export const maxDuration = 60 // 60 seconds timeout

export async function POST(request: NextRequest) {
  logger.info('Starting file upload request')

  try {
    // Check authentication and get Drive config
    const authResult = await requireAuthWithDrive(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user, driveConfig, oauth2Client } = authResult
    logger.info('User authenticated', { userId: user.id })
    logger.debug('Drive configured', { folderId: driveConfig.incomingFolderId })

    // Parse form data
    logger.debug('Parsing form data')
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      throw new ValidationError('No file provided')
    }

    logger.info('File received', {
      name: file.name,
      type: file.type,
      size: file.size
    })

    // Validate file type and size
    validateMimeType(file.type, config.drive.supportedMimeTypes)
    validateFileSize(file.size, config.drive.maxFileSize)
    logger.debug('File validation passed')


    // Setup Drive client (oauth2Client already created above)
    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    // Always use resumable upload for reliability (works for any file size)
    // This avoids the 500 errors we're seeing with multipart uploads
    console.log(`[UPLOAD] File size: ${(file.size / 1024 / 1024).toFixed(2)}MB, using resumable upload`)
    let response

    try {
      // Get access token for direct API calls
      const { token } = await oauth2Client.getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token for resumable upload')
      }

      // Step 1: Initiate resumable upload session
      console.log('[UPLOAD] Initiating resumable upload session...')
      const initiateResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': file.type || 'application/octet-stream',
            'X-Upload-Content-Length': file.size.toString()
          },
          body: JSON.stringify({
            name: file.name,
            parents: [driveConfig.incomingFolderId],
            mimeType: file.type
          })
        }
      )

      if (!initiateResponse.ok) {
        const errorText = await initiateResponse.text()
        console.error('[UPLOAD] Failed to initiate resumable upload:', errorText)
        throw new Error(`Failed to initiate upload: ${initiateResponse.status}`)
      }

      // Get the upload session URL
      const sessionUrl = initiateResponse.headers.get('Location')
      if (!sessionUrl) {
        throw new Error('No upload session URL returned')
      }

      console.log('[UPLOAD] Resumable session created, uploading file...')

      // Step 2: Upload the file data with retry logic
      const fileBuffer = await file.arrayBuffer()
      let retries = 3
      let uploadResponse

      while (retries > 0) {
        uploadResponse = await fetch(sessionUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': file.size.toString(),
            'Content-Type': file.type || 'application/octet-stream'
          },
          body: fileBuffer
        })

        if (uploadResponse.ok) {
          break
        }

        // Check if it's a retryable error
        if (uploadResponse.status >= 500 && retries > 1) {
          console.log(`[UPLOAD] Upload failed with ${uploadResponse.status}, retrying... (${retries - 1} retries left)`)
          await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries))) // Exponential backoff
          retries--
        } else {
          const errorText = await uploadResponse.text()
          console.error('[UPLOAD] Resumable upload failed:', errorText)
          throw new Error(`Upload failed: ${uploadResponse.status}`)
        }
      }

      if (!uploadResponse || !uploadResponse.ok) {
        throw new Error('Upload failed after retries')
      }

      // Parse the response
      const uploadedFile = await uploadResponse.json()
      console.log('[UPLOAD] Resumable upload successful:', uploadedFile.id)

      // Format response to match drive.files.create response
      response = { data: uploadedFile }
    } catch (uploadError: any) {
      console.error('[UPLOAD] Drive upload failed:', uploadError)

      // Check if it's a timeout or size issue
      if (uploadError.code === 'ETIMEDOUT' || uploadError.code === 'ECONNRESET' ||
          uploadError.message?.includes('timeout') || uploadError.code === 500 ||
          uploadError.message?.includes('failed')) {
        return NextResponse.json({
          error: 'Upload failed',
          suggestion: 'The file may be too large or the connection timed out. Try a smaller file or check your internet connection.',
          details: uploadError.message
        }, { status: 413 })
      }

      throw uploadError // Re-throw for general error handling
    }

    console.log('[UPLOAD] Drive upload successful:', response.data.id)

    const uploadedFile = response.data

    // Save to database
    console.log('[UPLOAD] Saving to database...')
    const dbFile = await prisma.file.create({
      data: {
        userId: user.id,
        driveFileId: uploadedFile.id!,
        name: uploadedFile.name!,
        mimeType: uploadedFile.mimeType || file.type,
        size: BigInt(uploadedFile.size || file.size),
        driveUrl: uploadedFile.webViewLink || undefined,
        thumbnailUrl: uploadedFile.thumbnailLink || undefined,
        status: 'NEW'
      }
    })
    console.log('[UPLOAD] Database save successful:', dbFile.id)

    return NextResponse.json({
      success: true,
      file: {
        id: uploadedFile.id,
        name: uploadedFile.name,
        size: uploadedFile.size || file.size,
        mimeType: uploadedFile.mimeType || file.type,
        webViewLink: uploadedFile.webViewLink,
        thumbnailLink: uploadedFile.thumbnailLink
      },
      message: `Successfully uploaded ${file.name} to your Drive`
    })

  } catch (error: any) {
    console.error('[UPLOAD] Error occurred:', error)
    console.error('[UPLOAD] Error stack:', error instanceof Error ? error.stack : 'No stack')

    // Log Google API specific error details
    if (error.response) {
      console.error('[UPLOAD] Google API Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      })
    }

    // Additional error details for OAuth/Gaxios errors
    if (error.code || error.errors) {
      console.error('[UPLOAD] Error details:', {
        code: error.code,
        errors: error.errors,
        name: error.name
      })
    }

    // Check for specific Google errors
    if (error instanceof Error && error.message.includes('invalid_grant')) {
      return NextResponse.json(
        { error: 'Google authorization expired. Please sign in again.' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        error: 'Upload failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        } : error
      },
      { status: 500 }
    )
  }
}

// GET endpoint to check upload limits
export async function GET() {
  return NextResponse.json({
    maxFileSize: config.drive.maxFileSize,
    maxFileSizeMB: config.drive.maxFileSize / (1024 * 1024),
    supportedTypes: config.drive.supportedMimeTypes,
    supportedExtensions: ['.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.m4a', '.ogg']
  })
}