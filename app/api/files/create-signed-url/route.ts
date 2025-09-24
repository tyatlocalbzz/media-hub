import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth-service-account'
import { gcsService } from '@/lib/services/gcs-service'
import { checkRateLimit } from '@/lib/middleware/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(authResult.user.id, 'upload')
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining
        },
        { status: 429 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { fileName, fileSize, mimeType, resumable = false } = body

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

    console.log('[SIGNED-URL] Creating signed URL for:', {
      fileName,
      fileSize,
      mimeType,
      userId: authResult.user.id,
      resumable
    })

    // Generate signed URL based on file size
    let result

    if (resumable || fileSize > 100 * 1024 * 1024) { // Use resumable for files > 100MB
      result = await gcsService.generateResumableUploadUrl(
        fileName,
        mimeType,
        fileSize,
        authResult.user.id
      )
    } else {
      result = await gcsService.generateSignedUploadUrl(
        fileName,
        mimeType,
        fileSize,
        authResult.user.id
      )
    }

    console.log('[SIGNED-URL] Generated URL for:', result.fileKey)

    return NextResponse.json({
      success: true,
      uploadUrl: result.uploadUrl,
      fileKey: result.fileKey,
      bucketName: result.bucketName,
      directUpload: true,
      resumable: resumable || fileSize > 100 * 1024 * 1024,
      fileName,
      fileSize,
      mimeType
    })
  } catch (error) {
    console.error('[SIGNED-URL] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create signed URL'
      },
      { status: 500 }
    )
  }
}