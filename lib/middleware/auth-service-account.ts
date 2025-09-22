import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'

export interface AuthenticatedUser {
  id: string
  email: string
}

/**
 * Simplified authentication middleware for service account architecture
 * Only validates user authentication, no Drive OAuth needed
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

    // Ensure user exists in our database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true }
    })

    if (!dbUser) {
      // Create user if they don't exist
      const newUser = await prisma.user.create({
        data: {
          id: user.id,
          email: user.email || '',
          created_at: new Date()
        },
        select: { id: true, email: true }
      })

      return {
        success: true,
        user: newUser
      }
    }

    return {
      success: true,
      user: dbUser
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
 * Helper to get user from request
 */
export async function getUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  const authResult = await requireAuth(request)
  return authResult.success && authResult.user ? authResult.user : null
}