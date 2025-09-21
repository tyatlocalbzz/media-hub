/**
 * Environment Variable Configuration Check
 * Validates that all required environment variables are present
 */

export function checkEnvironmentVariables() {
  const required = {
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

    // Google OAuth
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

    // Database
    DATABASE_URL: process.env.DATABASE_URL,
  }

  const missing = []
  const configured = []

  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      missing.push(key)
    } else {
      configured.push(key)
    }
  }

  // Log status (only in development or if there are missing variables)
  if (process.env.NODE_ENV === 'development' || missing.length > 0) {
    console.log('[ENV] Environment variables check:')
    console.log('[ENV] Configured:', configured.length, 'variables')

    if (missing.length > 0) {
      console.error('[ENV] ⚠️  Missing required environment variables:')
      missing.forEach(key => {
        console.error(`[ENV]   - ${key}`)
      })
      console.error('[ENV] Please add these to your Vercel environment variables')
    } else {
      console.log('[ENV] ✅ All required environment variables are configured')
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    configured
  }
}

// Run check on module load (server-side only)
if (typeof window === 'undefined') {
  checkEnvironmentVariables()
}