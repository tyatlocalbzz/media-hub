// Rate limiting middleware for upload protection
import prisma from '@/lib/prisma'

interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Max requests per window
  maxBytes?: number     // Max bytes per window (optional)
}

interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  retryAfter?: number   // Seconds until reset
  bytesRemaining?: number
}

// Default rate limit configurations
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  upload: {
    windowMs: 60 * 60 * 1000,    // 1 hour
    maxRequests: 20,              // 20 uploads per hour
    maxBytes: 1024 * 1024 * 1024  // 1GB per hour
  },
  api: {
    windowMs: 60 * 1000,          // 1 minute
    maxRequests: 60               // 60 requests per minute
  }
}

export async function checkRateLimit(
  userId: string,
  limitType: 'upload' | 'api' = 'api',
  bytesRequested: number = 0
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[limitType]
  const now = new Date()
  const windowStart = new Date(now.getTime() - config.windowMs)

  try {
    // Get recent activity from database
    const recentActivity = await prisma.rateLimitLog.findMany({
      where: {
        userId,
        type: limitType,
        createdAt: {
          gte: windowStart
        }
      },
      select: {
        createdAt: true,
        bytes: true
      }
    })

    // Count requests and bytes
    const requestCount = recentActivity.length
    const bytesUsed = recentActivity.reduce((sum, log) => sum + (log.bytes || 0), 0)

    // Check if limit exceeded
    const requestsRemaining = config.maxRequests - requestCount
    const bytesRemaining = config.maxBytes ? config.maxBytes - bytesUsed : undefined

    // Check request limit
    if (requestCount >= config.maxRequests) {
      const oldestLog = recentActivity[0]
      const resetTime = new Date(oldestLog.createdAt.getTime() + config.windowMs)
      const retryAfter = Math.ceil((resetTime.getTime() - now.getTime()) / 1000)

      return {
        allowed: false,
        limit: config.maxRequests,
        remaining: 0,
        retryAfter,
        bytesRemaining
      }
    }

    // Check byte limit if applicable
    if (config.maxBytes && bytesUsed + bytesRequested > config.maxBytes) {
      const oldestLog = recentActivity[0]
      const resetTime = new Date(oldestLog.createdAt.getTime() + config.windowMs)
      const retryAfter = Math.ceil((resetTime.getTime() - now.getTime()) / 1000)

      return {
        allowed: false,
        limit: config.maxRequests,
        remaining: requestsRemaining,
        retryAfter,
        bytesRemaining: Math.max(0, config.maxBytes - bytesUsed)
      }
    }

    // Log this request
    await prisma.rateLimitLog.create({
      data: {
        userId,
        type: limitType,
        bytes: bytesRequested || 0
      }
    })

    // Clean up old logs (async, don't wait)
    cleanupOldLogs(userId, limitType, windowStart).catch(console.error)

    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: requestsRemaining - 1, // -1 because we just used one
      bytesRemaining: bytesRemaining ? bytesRemaining - bytesRequested : undefined
    }
  } catch (error) {
    console.error('[Rate Limit] Error checking rate limit:', error)

    // On error, allow the request but log it
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests
    }
  }
}

// Cleanup old rate limit logs
async function cleanupOldLogs(
  userId: string,
  type: string,
  before: Date
): Promise<void> {
  try {
    await prisma.rateLimitLog.deleteMany({
      where: {
        userId,
        type,
        createdAt: {
          lt: before
        }
      }
    })
  } catch (error) {
    console.error('[Rate Limit] Error cleaning up old logs:', error)
  }
}

// Get user's current rate limit status
export async function getRateLimitStatus(
  userId: string,
  limitType: 'upload' | 'api' = 'api'
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[limitType]
  const now = new Date()
  const windowStart = new Date(now.getTime() - config.windowMs)

  try {
    const recentActivity = await prisma.rateLimitLog.findMany({
      where: {
        userId,
        type: limitType,
        createdAt: {
          gte: windowStart
        }
      },
      select: {
        createdAt: true,
        bytes: true
      }
    })

    const requestCount = recentActivity.length
    const bytesUsed = recentActivity.reduce((sum, log) => sum + (log.bytes || 0), 0)
    const requestsRemaining = Math.max(0, config.maxRequests - requestCount)
    const bytesRemaining = config.maxBytes
      ? Math.max(0, config.maxBytes - bytesUsed)
      : undefined

    let retryAfter: number | undefined
    if (requestCount >= config.maxRequests && recentActivity.length > 0) {
      const oldestLog = recentActivity[0]
      const resetTime = new Date(oldestLog.createdAt.getTime() + config.windowMs)
      retryAfter = Math.ceil((resetTime.getTime() - now.getTime()) / 1000)
    }

    return {
      allowed: requestCount < config.maxRequests,
      limit: config.maxRequests,
      remaining: requestsRemaining,
      retryAfter,
      bytesRemaining
    }
  } catch (error) {
    console.error('[Rate Limit] Error getting status:', error)

    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests
    }
  }
}

// Reset rate limit for a user (admin function)
export async function resetRateLimit(
  userId: string,
  limitType?: 'upload' | 'api'
): Promise<void> {
  try {
    await prisma.rateLimitLog.deleteMany({
      where: {
        userId,
        ...(limitType ? { type: limitType } : {})
      }
    })
  } catch (error) {
    console.error('[Rate Limit] Error resetting rate limit:', error)
    throw error
  }
}