import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth-service-account'

export async function PUT(request: NextRequest) {
  const startTime = Date.now()
  let chunkNumber = 0

  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.user) {
      console.error('[UPLOAD-CHUNK] Authentication failed')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the session URI from query params
    const sessionUri = request.nextUrl.searchParams.get('sessionUri')
    if (!sessionUri) {
      return NextResponse.json(
        { error: 'Missing sessionUri parameter' },
        { status: 400 }
      )
    }

    // Get content range header
    const contentRange = request.headers.get('content-range')
    if (!contentRange) {
      return NextResponse.json(
        { error: 'Missing Content-Range header' },
        { status: 400 }
      )
    }

    // Parse content range to get chunk details
    const rangeMatch = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1])
      const end = parseInt(rangeMatch[2])
      const total = parseInt(rangeMatch[3])
      chunkNumber = Math.floor(start / (10 * 1024 * 1024)) + 1 // Assuming 10MB chunks

      console.log('[UPLOAD-CHUNK] Chunk details:', {
        chunkNumber,
        start,
        end,
        expectedChunkSize: end - start + 1,
        totalFileSize: total,
        progress: `${((end + 1) / total * 100).toFixed(2)}%`
      })
    }

    // Get the chunk data
    const chunk = await request.blob()

    console.log('[UPLOAD-CHUNK] Processing chunk upload:', {
      sessionUri: sessionUri.substring(0, 50) + '...',
      contentRange,
      actualChunkSize: chunk.size,
      chunkType: chunk.type,
      userId: authResult.user.id,
      timestamp: new Date().toISOString()
    })

    // Forward the chunk to Google Drive
    console.log('[UPLOAD-CHUNK] Forwarding to Google Drive...')
    const driveStartTime = Date.now()

    const response = await fetch(sessionUri, {
      method: 'PUT',
      headers: {
        'Content-Range': contentRange,
        'Content-Type': chunk.type || 'application/octet-stream'
      },
      body: chunk
    })

    const driveUploadTime = Date.now() - driveStartTime
    const uploadSpeed = chunk.size / (driveUploadTime / 1000) / (1024 * 1024) // MB/s

    console.log('[UPLOAD-CHUNK] Google Drive response:', {
      status: response.status,
      statusText: response.statusText,
      driveUploadTime: `${driveUploadTime}ms`,
      uploadSpeed: `${uploadSpeed.toFixed(2)} MB/s`,
      headers: {
        range: response.headers.get('range'),
        location: response.headers.get('location')
      }
    })

    // Get response headers we need to pass back
    const responseHeaders: Record<string, string> = {}

    // Important headers to forward
    const headersToForward = ['range', 'x-guploader-uploadid']
    headersToForward.forEach(header => {
      const value = response.headers.get(header)
      if (value) {
        responseHeaders[header] = value
      }
    })

    // Handle different response statuses
    if (response.status === 308) {
      // Resume Incomplete - chunk uploaded successfully, more chunks expected
      console.log('[UPLOAD-CHUNK] Chunk uploaded, waiting for more')
      return NextResponse.json(
        {
          status: 'incomplete',
          message: 'Chunk uploaded successfully'
        },
        {
          status: 308,
          headers: responseHeaders
        }
      )
    } else if (response.status === 200 || response.status === 201) {
      // Upload complete
      const data = await response.json()
      const totalTime = Date.now() - startTime

      console.log('[UPLOAD-CHUNK] ✅ Upload complete:', {
        fileId: data.id,
        fileName: data.name,
        fileSize: data.size,
        mimeType: data.mimeType,
        totalChunks: chunkNumber,
        totalUploadTime: `${totalTime}ms`,
        averageSpeed: data.size ? `${(data.size / (totalTime / 1000) / (1024 * 1024)).toFixed(2)} MB/s` : 'N/A',
        timestamp: new Date().toISOString()
      })

      return NextResponse.json(
        {
          status: 'complete',
          file: data
        },
        { status: 200 }
      )
    } else {
      // Error
      const errorText = await response.text()
      console.error('[UPLOAD-CHUNK] Upload failed:', response.status, errorText)
      return NextResponse.json(
        {
          status: 'error',
          error: `Upload failed with status ${response.status}: ${errorText}`
        },
        { status: response.status }
      )
    }
  } catch (error) {
    console.error('[UPLOAD-CHUNK] Error:', error)
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to upload chunk'
      },
      { status: 500 }
    )
  }
}

// Support OPTIONS for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Content-Range'
    }
  })
}