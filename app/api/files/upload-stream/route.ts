// Streaming proxy endpoint for chunked uploads to Google Drive
// This endpoint receives chunks from the browser and streams them to Google Drive
// Avoids CORS issues and Vercel's body size limit

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth'

// Increase timeout for large file uploads
export const maxDuration = 60 // 60 seconds timeout

export async function PUT(request: NextRequest) {
  console.log('[UPLOAD-STREAM] Processing chunk upload')

  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.success) {
      return authResult.response
    }

    // Get headers from request
    const sessionUrl = request.headers.get('X-Session-URL')
    const accessToken = request.headers.get('X-Access-Token')
    const contentRange = request.headers.get('Content-Range')
    const contentType = request.headers.get('X-Original-Content-Type') || 'application/octet-stream'

    if (!sessionUrl || !accessToken) {
      return NextResponse.json(
        { error: 'Missing session URL or access token' },
        { status: 400 }
      )
    }

    console.log(`[UPLOAD-STREAM] Uploading chunk: ${contentRange}`)

    // Get the chunk data
    const chunkData = await request.arrayBuffer()

    // Forward the chunk to Google Drive
    const uploadResponse = await fetch(sessionUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Length': chunkData.byteLength.toString(),
        'Content-Type': contentType,
        ...(contentRange && { 'Content-Range': contentRange })
      },
      body: chunkData
    })

    console.log(`[UPLOAD-STREAM] Google Drive response: ${uploadResponse.status}`)

    // Handle different response statuses
    if (uploadResponse.ok) {
      // Upload complete (200/201)
      const fileData = await uploadResponse.json()
      console.log('[UPLOAD-STREAM] Upload complete:', fileData.id)

      return NextResponse.json({
        success: true,
        complete: true,
        file: fileData
      })
    } else if (uploadResponse.status === 308) {
      // Chunk uploaded successfully, more chunks expected
      const range = uploadResponse.headers.get('Range')
      console.log('[UPLOAD-STREAM] Chunk uploaded, next range:', range)

      return NextResponse.json({
        success: true,
        complete: false,
        nextRange: range
      })
    } else {
      // Error occurred
      const errorText = await uploadResponse.text()
      console.error('[UPLOAD-STREAM] Upload error:', uploadResponse.status, errorText)

      return NextResponse.json(
        {
          error: 'Chunk upload failed',
          status: uploadResponse.status,
          details: errorText
        },
        { status: uploadResponse.status }
      )
    }

  } catch (error: any) {
    console.error('[UPLOAD-STREAM] Error:', error)
    return NextResponse.json(
      {
        error: 'Stream upload failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST endpoint to verify session is still valid
export async function POST(request: NextRequest) {
  console.log('[UPLOAD-STREAM] Verifying upload session')

  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { sessionUrl, accessToken } = await request.json()

    if (!sessionUrl || !accessToken) {
      return NextResponse.json(
        { error: 'Missing session URL or access token' },
        { status: 400 }
      )
    }

    // Query upload status
    const statusResponse = await fetch(sessionUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Range': 'bytes */*' // Query current status
      }
    })

    if (statusResponse.status === 308) {
      // Upload in progress
      const range = statusResponse.headers.get('Range')
      const bytesReceived = range ? parseInt(range.split('-')[1]) + 1 : 0

      return NextResponse.json({
        valid: true,
        bytesUploaded: bytesReceived
      })
    } else if (statusResponse.ok) {
      // Upload already complete
      return NextResponse.json({
        valid: true,
        complete: true
      })
    } else {
      // Session invalid or expired
      return NextResponse.json({
        valid: false,
        error: 'Session expired or invalid'
      })
    }

  } catch (error: any) {
    console.error('[UPLOAD-STREAM] Verification error:', error)
    return NextResponse.json(
      {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}