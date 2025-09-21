// List files from database
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth'
import prisma from '@/lib/prisma'
import { createLogger } from '@/lib/logger'
import { serializeBigInt } from '@/lib/utils'

const logger = createLogger('FILES')

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user } = authResult
    logger.debug('Fetching files for user', { userId: user.id })

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const includeDeleted = searchParams.get('includeDeleted') === 'true'
    const status = searchParams.get('status') as 'NEW' | 'TRANSCRIBING' | 'READY' | null

    // Build query
    const where: any = {
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

// DELETE endpoint to remove a file from tracking
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user } = authResult

    // Get file ID from request body
    const body = await request.json()
    const { fileId } = body

    if (!fileId) {
      return NextResponse.json(
        { error: 'Missing fileId' },
        { status: 400 }
      )
    }

    logger.info(`Deleting file ${fileId} for user ${user.id}`)

    // Soft delete the file
    const file = await prisma.file.updateMany({
      where: {
        id: fileId,
        userId: user.id
      },
      data: {
        isDeleted: true
      }
    })

    if (file.count === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    logger.info(`File ${fileId} marked as deleted`)

    return NextResponse.json({
      success: true,
      message: 'File removed from tracking'
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