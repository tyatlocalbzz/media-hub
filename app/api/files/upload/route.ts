// Upload files directly to Google Drive using Service Account
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { config } from '@/lib/config'
import { requireAuth } from '@/lib/middleware/auth-service-account'
import { uploadFile, getDriveClient } from '@/lib/services/drive-service-account'
import { createLogger } from '@/lib/logger'
import { validateMimeType, validateFileSize } from '@/lib/errors'

const logger = createLogger('UPLOAD-SA')

// Increase timeout for large file uploads
export const maxDuration = 60 // 60 seconds timeout

export async function POST(request: NextRequest) {
  logger.info('Starting file upload request (Service Account)')

  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user } = authResult

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      )
    }

    logger.info('User authenticated', { userId: user.id })

    // Parse form data
    logger.debug('Parsing form data')
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    logger.info('File details', {
      name: file.name,
      size: file.size,
      type: file.type
    })

    // Validate file
    try {
      validateMimeType(file.type)
      validateFileSize(file.size)
    } catch (validationError: any) {
      logger.warn('File validation failed', { error: validationError.message })
      return NextResponse.json(
        { error: validationError.message },
        { status: 400 }
      )
    }

    // Check for duplicate file
    const existingFile = await prisma.file.findFirst({
      where: {
        userId: user.id,
        name: file.name,
        size: BigInt(file.size),
        isDeleted: false
      }
    })

    if (existingFile) {
      logger.info('File already exists', { fileId: existingFile.id })
      return NextResponse.json({
        success: true,
        duplicate: true,
        file: {
          id: existingFile.driveFileId,
          name: existingFile.name,
          size: existingFile.size?.toString(),
          mimeType: existingFile.mimeType
        }
      })
    }

    // Convert file to buffer for upload
    const buffer = Buffer.from(await file.arrayBuffer())

    // Upload to Google Drive using service account
    logger.info('Uploading to Google Drive (Service Account)')
    const uploadResult = await uploadFile(user.id, buffer, {
      name: file.name,
      mimeType: file.type,
      size: file.size
    })

    if (!uploadResult.success || !uploadResult.file) {
      logger.error('Drive upload failed', { error: uploadResult.error })
      return NextResponse.json(
        { error: uploadResult.error || 'Failed to upload to Drive' },
        { status: 500 }
      )
    }

    const driveFile = uploadResult.file
    logger.info('File uploaded successfully', { driveFileId: driveFile.id })

    // Save file metadata to database
    const savedFile = await prisma.file.create({
      data: {
        userId: user.id,
        driveFileId: driveFile.id!,
        name: driveFile.name || file.name,
        mimeType: driveFile.mimeType || file.type,
        size: BigInt(driveFile.size || file.size),
        driveUrl: driveFile.webViewLink || null,
        thumbnailUrl: driveFile.thumbnailLink || null,
        status: 'NEW',
        createdAt: new Date()
      }
    })

    logger.info('File metadata saved', { dbFileId: savedFile.id })

    return NextResponse.json({
      success: true,
      file: {
        id: savedFile.driveFileId,
        name: savedFile.name,
        size: savedFile.size?.toString(),
        mimeType: savedFile.mimeType,
        webViewLink: savedFile.driveUrl,
        thumbnailLink: savedFile.thumbnailUrl
      },
      message: 'File uploaded successfully using service account'
    })

  } catch (error: any) {
    logger.error('Upload error', {
      message: error.message,
      stack: error.stack
    })

    return NextResponse.json(
      {
        error: 'Failed to upload file',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}