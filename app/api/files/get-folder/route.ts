import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth-service-account'
import { driveService } from '@/lib/services/drive-service-account'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get or create user's folder
    const userFolderId = await driveService.getOrCreateUserFolder(authResult.user.id)

    return NextResponse.json({
      success: true,
      folderId: userFolderId,
      folderUrl: `https://drive.google.com/drive/folders/${userFolderId}`
    })
  } catch (error) {
    console.error('[GET-FOLDER] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get user folder'
      },
      { status: 500 }
    )
  }
}