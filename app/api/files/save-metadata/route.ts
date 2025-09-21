// Save file metadata after successful client-side upload to Google Drive
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth } from '@/lib/middleware/auth'

export async function POST(request: NextRequest) {
  console.log('[SAVE-METADATA] Saving file metadata to database')

  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user } = authResult

    // Parse request body
    const body = await request.json()
    const {
      driveFileId,
      name,
      mimeType,
      size,
      driveUrl,
      thumbnailUrl,
      duration
    } = body

    // Validate required fields
    if (!driveFileId || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: driveFileId and name' },
        { status: 400 }
      )
    }

    console.log('[SAVE-METADATA] File details:', {
      userId: user.id,
      driveFileId,
      name,
      size,
      mimeType
    })

    // Check if file already exists
    const existingFile = await prisma.file.findUnique({
      where: { driveFileId }
    })

    if (existingFile) {
      console.log('[SAVE-METADATA] File already exists in database:', existingFile.id)

      // Convert BigInt to string for JSON serialization
      const fileResponse = {
        ...existingFile,
        size: existingFile.size ? existingFile.size.toString() : null
      }

      return NextResponse.json({
        success: true,
        file: fileResponse,
        duplicate: true,
        message: 'File metadata already saved'
      })
    }

    // Save to database
    const dbFile = await prisma.file.create({
      data: {
        userId: user.id,
        driveFileId,
        name,
        mimeType: mimeType || null,
        size: size ? BigInt(size) : null,
        duration: duration || null,
        driveUrl: driveUrl || null,
        thumbnailUrl: thumbnailUrl || null,
        status: 'NEW'
      }
    })

    console.log('[SAVE-METADATA] Database save successful:', dbFile.id)

    // Convert BigInt to string for JSON serialization
    const fileResponse = {
      ...dbFile,
      size: dbFile.size ? dbFile.size.toString() : null
    }

    return NextResponse.json({
      success: true,
      file: fileResponse,
      message: 'File metadata saved successfully'
    })

  } catch (error: any) {
    console.error('[SAVE-METADATA] Error:', error)

    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'File already exists in database' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to save file metadata',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET endpoint to check if file exists
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const driveFileId = searchParams.get('driveFileId')

  if (!driveFileId) {
    return NextResponse.json(
      { error: 'Missing driveFileId parameter' },
      { status: 400 }
    )
  }

  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user } = authResult

    // Check if file exists
    const file = await prisma.file.findFirst({
      where: {
        driveFileId,
        userId: user.id
      }
    })

    if (file) {
      // Convert BigInt to string for JSON
      const fileResponse = {
        ...file,
        size: file.size ? file.size.toString() : null
      }

      return NextResponse.json({
        exists: true,
        file: fileResponse
      })
    } else {
      return NextResponse.json({
        exists: false,
        file: null
      })
    }

  } catch (error: any) {
    console.error('[SAVE-METADATA] Error checking file:', error)
    return NextResponse.json(
      {
        error: 'Failed to check file',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}