import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { google } from 'googleapis'

export interface AuthenticatedUser {
  id: string
  email: string
  driveConfig?: {
    refreshToken: string
    driveFolderId: string | null
    incomingFolderId: string | null
  }
}

/**
 * Middleware to authenticate API requests
 * Returns user data if authenticated, error response if not
 */
export async function requireAuth(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Unauthorized', details: authError?.message },
          { status: 401 }
        )
      }
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email || ''
      }
    }
  } catch (error) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Authentication failed', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Get user's Google Drive configuration
 * Includes refresh token and folder IDs
 */
export async function getUserDriveConfig(userId: string) {
  const userData = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      refresh_token: true,
      drive_folder_id: true,
      incoming_folder_id: true
    }
  })

  if (!userData?.refresh_token) {
    return null
  }

  return {
    refreshToken: userData.refresh_token,
    driveFolderId: userData.drive_folder_id,
    incomingFolderId: userData.incoming_folder_id
  }
}

/**
 * Create Google OAuth2 client with user's refresh token
 */
export async function createOAuth2Client(refreshToken: string) {
  // Validate that Google OAuth credentials are configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('[OAuth] Missing Google OAuth credentials in environment variables')
    console.error('[OAuth] GOOGLE_CLIENT_ID exists:', !!process.env.GOOGLE_CLIENT_ID)
    console.error('[OAuth] GOOGLE_CLIENT_SECRET exists:', !!process.env.GOOGLE_CLIENT_SECRET)
    throw new Error('Google OAuth credentials not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to environment variables.')
  }

  // Store credentials in variables to ensure they're captured
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/callback`

  // Log actual credential values (masked) for debugging
  console.log('[OAuth] Environment variables check:', {
    GOOGLE_CLIENT_ID: clientId ? `${clientId.substring(0, 10)}...${clientId.substring(clientId.length - 4)}` : 'UNDEFINED',
    GOOGLE_CLIENT_SECRET: clientSecret ? `${clientSecret.substring(0, 6)}...` : 'UNDEFINED',
    redirectUri: redirectUri
  })

  // Use positional arguments for OAuth2 constructor (works with googleapis v160)
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  )

  console.log('[OAuth] OAuth2 client created successfully')

  // Set only the refresh token
  oauth2Client.setCredentials({
    refresh_token: refreshToken
  })

  // Verify the token works
  try {
    const { token } = await oauth2Client.getAccessToken()
    if (!token) {
      console.error('[OAuth] Failed to get access token - token is null')
      return null
    }
    return oauth2Client
  } catch (error) {
    console.error('[OAuth] Failed to refresh access token:', error)
    // Log more details about the error
    if (error instanceof Error) {
      console.error('[OAuth] Error message:', error.message)
      if ('response' in error) {
        console.error('[OAuth] Error response:', (error as any).response?.data)
      }
    }
    return null
  }
}

/**
 * Complete authentication with Drive config
 * Returns everything needed for Drive operations
 */
export async function requireAuthWithDrive(request: NextRequest) {
  // First check basic auth
  const authResult = await requireAuth(request)
  if (!authResult.success) {
    return authResult
  }

  // Get Drive config
  const driveConfig = await getUserDriveConfig(authResult.user!.id)
  if (!driveConfig) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Drive not configured. Please sign in again.' },
        { status: 400 }
      )
    }
  }

  // Verify incoming folder is set
  if (!driveConfig.incomingFolderId) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Drive folder not found. Please reconnect your Google account.' },
        { status: 400 }
      )
    }
  }

  // Create OAuth client
  let oauth2Client
  try {
    oauth2Client = await createOAuth2Client(driveConfig.refreshToken)
    if (!oauth2Client) {
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Authentication expired. Please sign in again.' },
          { status: 401 }
        )
      }
    }
  } catch (error) {
    console.error('[Auth] OAuth client creation failed:', error)
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'OAuth configuration error',
          details: error instanceof Error ? error.message : 'Failed to create OAuth client',
          help: 'Please ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured in environment variables.'
        },
        { status: 500 }
      )
    }
  }

  return {
    success: true,
    user: authResult.user!,
    driveConfig,
    oauth2Client
  }
}