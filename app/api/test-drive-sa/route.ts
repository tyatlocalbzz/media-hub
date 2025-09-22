// Test endpoint for Service Account Drive connection
import { NextRequest, NextResponse } from 'next/server'
import { testDriveConnection } from '@/lib/services/drive-service-account'

export async function GET(request: NextRequest) {
  try {
    console.log('[TEST] Testing Drive Service Account connection...')

    // Test the connection
    const result = await testDriveConnection()

    if (!result.success) {
      console.error('[TEST] Connection failed:', result.error)
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          message: 'Failed to connect to Google Drive using service account'
        },
        { status: 500 }
      )
    }

    console.log('[TEST] Connection successful:', result.user)

    // Also check environment variables
    const envCheck = {
      hasServiceAccountKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      hasSharedDriveId: !!process.env.SHARED_DRIVE_ID,
      hasRootFolderId: !!process.env.MEDIA_HUB_ROOT_FOLDER_ID,
      keyLength: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.length || 0
    }

    return NextResponse.json({
      success: true,
      connection: result,
      environment: envCheck,
      message: 'Service account connection successful'
    })

  } catch (error: any) {
    console.error('[TEST] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
        message: 'Unexpected error while testing service account'
      },
      { status: 500 }
    )
  }
}