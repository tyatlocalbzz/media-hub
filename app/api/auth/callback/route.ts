import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (!code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const supabase = await createClient()
  const { data: sessionData, error: authError } = await supabase.auth.exchangeCodeForSession(code)

  if (authError || !sessionData?.user) {
    console.error('Auth error:', authError)
    return NextResponse.redirect(`${origin}/login`)
  }

  const userId = sessionData.user.id
  const email = sessionData.user.email
  const providerToken = sessionData.session?.provider_token
  const providerRefreshToken = sessionData.session?.provider_refresh_token

  // Log token presence for debugging OAuth issues
  console.log('[OAuth] Tokens received from Supabase:', {
    userId,
    hasAccessToken: !!providerToken,
    hasRefreshToken: !!providerRefreshToken,
    tokenLength: providerToken?.length,
    refreshLength: providerRefreshToken?.length
  })

  const { data: existingUser } = await supabase
    .from('users')
    .select('drive_folder_id, created_at')
    .eq('id', userId)
    .single()

  let driveFolderId = existingUser?.drive_folder_id
  let isNewUser = false

  if (!driveFolderId && providerToken) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${origin}/api/auth/callback`
      )

      oauth2Client.setCredentials({
        access_token: providerToken,
        refresh_token: providerRefreshToken,
      })

      const drive = google.drive({ version: 'v3', auth: oauth2Client })

      const mediaHubFolder = await drive.files.create({
        requestBody: {
          name: 'Media Hub',
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      })

      if (mediaHubFolder.data.id) {
        driveFolderId = mediaHubFolder.data.id

        const incomingFolder = await drive.files.create({
          requestBody: {
            name: 'Incoming',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [driveFolderId],
          },
          fields: 'id',
        })

        const { error: updateError } = await supabase
          .from('users')
          .upsert({
            id: userId,
            email: email,
            drive_folder_id: driveFolderId,
            incoming_folder_id: incomingFolder.data.id,
            refresh_token: providerRefreshToken,
            created_at: new Date().toISOString(),
          })

        if (updateError) {
          console.error('Error saving user data:', updateError)
        } else {
          isNewUser = true
        }
      }
    } catch (error) {
      console.error('Error creating Drive folders:', error)
    }
  } else if (existingUser?.created_at) {
    // Check if user was created recently
    isNewUser = new Date(existingUser.created_at).getTime() > Date.now() - 10000
  }

  // Add onboarding parameter for new users with folders
  if (isNewUser && driveFolderId) {
    return NextResponse.redirect(`${origin}/dashboard?onboarding=true&folder=${driveFolderId}`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}