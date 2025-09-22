import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/middleware/auth-service-account';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    const { user } = authResult;

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      )
    }
    // Get user data from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        _count: {
          select: { files: true }
        }
      }
    });

    if (!dbUser) {
      // User exists in Supabase but not in our database yet
      // Create user record
      const newUser = await prisma.user.create({
        data: {
          id: user.id,
          email: user.email || '',
        }
      });

      return NextResponse.json({
        email: newUser.email,
        driveConfigured: true, // Always true with service account
        filesCount: 0,
      });
    }

    // With service account, Drive is always configured
    return NextResponse.json({
      email: dbUser.email,
      driveConfigured: true, // Always true with service account
      filesCount: dbUser._count.files,
      incomingFolderId: process.env.SHARED_DRIVE_ID || null,
    });

  } catch (error) {
    console.error('User API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
}