// List files from database
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth'
import prisma from '@/lib/prisma'
import { createLogger } from '@/lib/logger'
import { serializeBigInt } from '@/lib/utils'
import { deleteFileFromDrive } from '@/lib/services/drive'

const logger = createLogger('FILES')

export async function GET(request: NextRequest) {
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

    logger.debug('Fetching files for user', { userId: user.id })

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const includeDeleted = searchParams.get('includeDeleted') === 'true'
    const status = searchParams.get('status') as 'NEW' | 'TRANSCRIBING' | 'READY' | null

    // Build query
    const where: Record<string, any> = {
      userId: user.id
    }

    if (!includeDeleted) {
      where.isDeleted = false
    }

    if (status) {
      where.status = status
    }

    // Get files from database
    const files = await prisma.file.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Get summary stats
    const stats = {
      total: files.length,
      new: files.filter(f => f.status === 'NEW').length,
      transcribing: files.filter(f => f.status === 'TRANSCRIBING').length,
      ready: files.filter(f => f.status === 'READY').length,
      deleted: files.filter(f => f.isDeleted).length
    }

    // Convert BigInt to string for JSON serialization
    const serializedFiles = files.map(file => serializeBigInt(file))

    logger.debug(`Found ${files.length} files`)

    return NextResponse.json({
      success: true,
      files: serializedFiles,
      stats
    })

  } catch (error) {
    logger.error('Failed to list files', error)
    return NextResponse.json(
      {
        error: 'Failed to list files',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// DELETE endpoint to permanently delete a file from Google Drive and database
export async function DELETE(request: NextRequest) {
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

    // Get file ID from request body
    const body = await request.json()
    const { fileId } = body

    if (!fileId) {
      return NextResponse.json(
        { error: 'Missing fileId' },
        { status: 400 }
      )
    }

    logger.info(`Permanently deleting file ${fileId} for user ${user.id}`)

    // First, get the file details including the Drive file ID
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId: user.id
      },
      select: {
        id: true,
        driveFileId: true,
        name: true
      }
    })

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    // Delete from Google Drive first
    if (file.driveFileId) {
      logger.info(`Deleting file ${file.name} from Google Drive (${file.driveFileId})`)

      const driveResult = await deleteFileFromDrive(user.id, file.driveFileId)

      if (!driveResult.success) {
        logger.error(`Failed to delete file from Google Drive: ${driveResult.error}`)
        return NextResponse.json(
          {
            error: 'Failed to delete file from Google Drive',
            details: driveResult.error
          },
          { status: 500 }
        )
      }

      logger.info(`Successfully deleted file from Google Drive`)
    }

    // Now permanently delete from database
    await prisma.file.delete({
      where: {
        id: fileId
      }
    })

    logger.info(`File ${fileId} permanently deleted from database`)

    return NextResponse.json({
      success: true,
      message: 'File permanently deleted from Google Drive and database'
    })

  } catch (error) {
    logger.error('Failed to delete file', error)
    return NextResponse.json(
      {
        error: 'Failed to delete file',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}