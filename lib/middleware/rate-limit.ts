// Simple in-memory rate limiting for MVP
// Note: This resets on server restart - for production use Redis or database

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

// In-memory storage for rate limit data
const rateLimitStore = new Map<string, { requests: Date[], bytes: number }>()

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
  const key = `${userId}:${limitType}`

  // Get or create user's rate limit data
  let userData = rateLimitStore.get(key)
  if (!userData) {
    userData = { requests: [], bytes: 0 }
    rateLimitStore.set(key, userData)
  }

  // Clean up old requests
  userData.requests = userData.requests.filter(date => date > windowStart)

  // Count requests in current window
  const requestCount = userData.requests.length

  // Check if limit exceeded
  if (requestCount >= config.maxRequests) {
    const oldestRequest = userData.requests[0]
    const resetTime = new Date(oldestRequest.getTime() + config.windowMs)
    const retryAfter = Math.ceil((resetTime.getTime() - now.getTime()) / 1000)

    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      retryAfter,
      bytesRemaining: config.maxBytes ? Math.max(0, config.maxBytes - userData.bytes) : undefined
    }
  }

  // Check byte limit if applicable
  if (config.maxBytes && userData.bytes + bytesRequested > config.maxBytes) {
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: config.maxRequests - requestCount,
      bytesRemaining: Math.max(0, config.maxBytes - userData.bytes)
    }
  }

  // Allow the request
  userData.requests.push(now)
  userData.bytes += bytesRequested

  // Clean up old entries periodically
  if (Math.random() < 0.1) { // 10% chance to clean up
    cleanupOldEntries()
  }

  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - requestCount - 1,
    bytesRemaining: config.maxBytes ? Math.max(0, config.maxBytes - userData.bytes - bytesRequested) : undefined
  }
}

// Clean up old entries from memory
function cleanupOldEntries(): void {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    const [, limitType] = key.split(':')
    const config = RATE_LIMITS[limitType] || RATE_LIMITS.api
    const windowStart = now - config.windowMs

    // Remove entries with no recent requests
    value.requests = value.requests.filter(date => date.getTime() > windowStart)

    if (value.requests.length === 0) {
      rateLimitStore.delete(key)
    }
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
  const key = `${userId}:${limitType}`

  const userData = rateLimitStore.get(key)
  if (!userData) {
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests
    }
  }

  // Clean up old requests
  userData.requests = userData.requests.filter(date => date > windowStart)
  const requestCount = userData.requests.length

  let retryAfter: number | undefined
  if (requestCount >= config.maxRequests && userData.requests.length > 0) {
    const oldestRequest = userData.requests[0]
    const resetTime = new Date(oldestRequest.getTime() + config.windowMs)
    retryAfter = Math.ceil((resetTime.getTime() - now.getTime()) / 1000)
  }

  return {
    allowed: requestCount < config.maxRequests,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - requestCount),
    retryAfter,
    bytesRemaining: config.maxBytes ? Math.max(0, config.maxBytes - userData.bytes) : undefined
  }
}

// Reset rate limit for a user (admin function)
export async function resetRateLimit(
  userId: string,
  limitType?: 'upload' | 'api'
): Promise<void> {
  if (limitType) {
    rateLimitStore.delete(`${userId}:${limitType}`)
  } else {
    // Reset all limits for user
    rateLimitStore.delete(`${userId}:upload`)
    rateLimitStore.delete(`${userId}:api`)
  }
}