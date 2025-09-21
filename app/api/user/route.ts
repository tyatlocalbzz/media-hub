import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, getUserDriveConfig } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return authResult.response;
    }

    const { user } = authResult;

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
      // This can happen if the OAuth callback hasn't completed
      return NextResponse.json({
        email: user.email,
        driveConfigured: false,
        filesCount: 0,
      });
    }

    // Check if Drive is configured
    const driveConfig = await getUserDriveConfig(user.id);

    return NextResponse.json({
      email: dbUser.email,
      driveConfigured: !!driveConfig,
      filesCount: dbUser._count.files,
      incomingFolderId: driveConfig?.incomingFolderId || null,
    });

  } catch (error) {
    console.error('User API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
}