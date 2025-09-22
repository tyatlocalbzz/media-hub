// Sync Google Drive files with database
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware/auth-service-account'
import { listFiles } from '@/lib/services/drive-service-account'
import prisma from '@/lib/prisma'
import { createLogger } from '@/lib/logger'

const logger = createLogger('SYNC')

export async function POST(request: NextRequest) {
  logger.info('Starting Drive sync')

  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user } = authResult

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      )
    }    logger.info('User authenticated', { userId: user.id })

    // Create sync log entry
    const syncLog = await prisma.syncLog.create({
      data: {
        userId: user.id,
        startedAt: new Date()
      }
    })

    try {
      // Get files from Google Drive
      logger.debug('Fetching files from Drive')
      const driveResult = await listFiles(user.id)

      if (!driveResult.success) {
        throw new Error(driveResult.error || 'Failed to list Drive files')
      }

      const driveFiles = driveResult.files
      logger.info(`Found ${driveFiles.length} files in Drive`)

      // Get existing files from database
      const dbFiles = await prisma.file.findMany({
        where: {
          userId: user.id,
          isDeleted: false
        }
      })

      logger.debug(`Found ${dbFiles.length} files in database`)

      // Create maps for efficient lookup
      const driveFileMap = new Map(driveFiles.map(f => [f.id, f]))
      const dbFileMap = new Map(dbFiles.map(f => [f.driveFileId, f]))

      let filesAdded = 0
      let filesUpdated = 0
      let filesDeleted = 0

      // Process Drive files (add new, update existing)
      for (const driveFile of driveFiles) {
        const existingFile = dbFileMap.get(driveFile.id)

        if (!existingFile) {
          // Add new file
          logger.debug(`Adding new file: ${driveFile.name}`)
          await prisma.file.create({
            data: {
              userId: user.id,
              driveFileId: driveFile.id,
              name: driveFile.name,
              mimeType: driveFile.mimeType,
              size: driveFile.size ? BigInt(driveFile.size) : null,
              duration: driveFile.duration || null,
              driveUrl: driveFile.webViewLink,
              thumbnailUrl: driveFile.thumbnailUrl,
              driveModifiedTime: new Date(driveFile.modifiedTime),
              lastSyncedAt: new Date(),
              status: 'NEW'
            }
          })
          filesAdded++
        } else {
          // Check if file needs update
          const driveModified = new Date(driveFile.modifiedTime)
          const dbModified = existingFile.driveModifiedTime

          if (!dbModified || driveModified > dbModified) {
            logger.debug(`Updating file: ${driveFile.name}`)
            await prisma.file.update({
              where: { id: existingFile.id },
              data: {
                name: driveFile.name,
                mimeType: driveFile.mimeType,
                size: driveFile.size ? BigInt(driveFile.size) : null,
                duration: driveFile.duration || null,
                driveUrl: driveFile.webViewLink,
                thumbnailUrl: driveFile.thumbnailUrl,
                driveModifiedTime: driveModified,
                lastSyncedAt: new Date()
              }
            })
            filesUpdated++
          } else {
            // Just update sync timestamp
            await prisma.file.update({
              where: { id: existingFile.id },
              data: {
                lastSyncedAt: new Date()
              }
            })
          }
        }
      }

      // Mark deleted files (files in DB but not in Drive)
      for (const dbFile of dbFiles) {
        if (!driveFileMap.has(dbFile.driveFileId)) {
          logger.debug(`Marking file as deleted: ${dbFile.name}`)
          await prisma.file.update({
            where: { id: dbFile.id },
            data: {
              isDeleted: true,
              lastSyncedAt: new Date()
            }
          })
          filesDeleted++
        }
      }

      // Update sync log with results
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          completedAt: new Date(),
          filesAdded,
          filesUpdated,
          filesDeleted
        }
      })

      logger.info('Sync completed', {
        filesAdded,
        filesUpdated,
        filesDeleted
      })

      return NextResponse.json({
        success: true,
        stats: {
          filesAdded,
          filesUpdated,
          filesDeleted,
          totalFiles: driveFiles.length
        },
        syncLogId: syncLog.id
      })

    } catch (syncError) {
      // Update sync log with error
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          completedAt: new Date(),
          error: syncError instanceof Error ? syncError.message : 'Unknown sync error'
        }
      })
      throw syncError
    }

  } catch (error) {
    logger.error('Sync failed', error)

    if (error instanceof Error && error.message.includes('Authentication expired')) {
      return NextResponse.json(
        { error: 'Authentication expired. Please sign in again.' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to sync files',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve last sync status
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authResult = await requireAuth(request)
    if (!authResult.success) {
      return authResult.response
    }

    const { user } = authResult

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      )
    }
    // Get last sync log
    const lastSync = await prisma.syncLog.findFirst({
      where: { userId: user.id },
      orderBy: { startedAt: 'desc' }
    })

    // Get file counts
    const fileStats = await prisma.file.aggregate({
      where: {
        userId: user.id,
        isDeleted: false
      },
      _count: true
    })

    return NextResponse.json({
      lastSync: lastSync ? {
        id: lastSync.id,
        startedAt: lastSync.startedAt,
        completedAt: lastSync.completedAt,
        filesAdded: lastSync.filesAdded,
        filesUpdated: lastSync.filesUpdated,
        filesDeleted: lastSync.filesDeleted,
        error: lastSync.error
      } : null,
      totalFiles: fileStats._count
    })

  } catch (error) {
    logger.error('Failed to get sync status', error)
    return NextResponse.json(
      {
        error: 'Failed to get sync status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}