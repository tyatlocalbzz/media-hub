// Request deduplication utility to prevent duplicate API calls

interface CacheEntry {
  promise: Promise<any>
  timestamp: number
}

const requestCache = new Map<string, CacheEntry>()
const CACHE_TTL = 1000 // 1 second TTL for deduplication

/**
 * Deduplicates fetch requests by caching in-flight promises
 * @param key - Unique key for the request
 * @param fetcher - Function that returns a promise
 * @param options - Optional configuration
 */
export async function dedupedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: {
    ttl?: number
    force?: boolean
  }
): Promise<T> {
  const ttl = options?.ttl ?? CACHE_TTL
  const force = options?.force ?? false

  // Clean up expired entries
  cleanupExpiredEntries()

  // If force refresh, delete existing cache
  if (force) {
    requestCache.delete(key)
  }

  // Check if request is already in flight
  const cached = requestCache.get(key)
  if (cached && Date.now() - cached.timestamp < ttl) {
    console.debug(`[DEDUP] Returning cached promise for: ${key}`)
    return cached.promise as Promise<T>
  }

  // Create new request
  console.debug(`[DEDUP] Creating new request for: ${key}`)
  const promise = fetcher()
    .then(result => {
      // Keep successful results in cache for the TTL duration
      return result
    })
    .catch(error => {
      // Remove failed requests from cache immediately
      requestCache.delete(key)
      throw error
    })
    .finally(() => {
      // Clean up after TTL expires
      setTimeout(() => {
        requestCache.delete(key)
      }, ttl)
    })

  // Cache the promise
  requestCache.set(key, {
    promise,
    timestamp: Date.now()
  })

  return promise as Promise<T>
}

/**
 * Clean up expired cache entries
 */
function cleanupExpiredEntries() {
  const now = Date.now()
  const entries = Array.from(requestCache.entries())
  for (const [key, entry] of entries) {
    if (now - entry.timestamp > 30000) { // Clean up entries older than 30 seconds
      requestCache.delete(key)
    }
  }
}

/**
 * Clear all cached requests
 */
export function clearRequestCache() {
  requestCache.clear()
}

/**
 * Clear specific cached request
 */
export function clearCachedRequest(key: string) {
  requestCache.delete(key)
}

/**
 * Get cache size (for debugging)
 */
export function getRequestCacheSize(): number {
  return requestCache.size
}