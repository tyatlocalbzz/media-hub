import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

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

  // Ensure user exists in our database
  try {
    await prisma.user.upsert({
      where: { id: userId },
      update: { email: email || '' },
      create: {
        id: userId,
        email: email || ''
      }
    })
  } catch (error) {
    console.error('Error creating/updating user:', error)
  }

  // Check if this is a new user (created in the last 10 seconds)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { created_at: true }
  })

  const isNewUser = user?.created_at &&
    new Date(user.created_at).getTime() > Date.now() - 10000

  if (isNewUser) {
    return NextResponse.redirect(`${origin}/dashboard?onboarding=true`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}