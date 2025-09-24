// This file configures the initialization of Sentry for the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,

  // Adjust this value in production
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Filter transactions
  beforeTransaction(context) {
    // Don't track health checks
    if (context.name === 'GET /api/health') {
      return null
    }

    return context
  },

  // Filter out expected errors
  beforeSend(event, hint) {
    if (hint.originalException && hint.originalException instanceof Error) {
      const error = hint.originalException

      // Don't report rate limiting (it's working as intended)
      if (error.message?.includes('Rate limit')) {
        return null
      }

      // Don't report database connection issues in dev
      if (process.env.NODE_ENV === 'development' && error.message?.includes('P1001')) {
        return null
      }

      // Add user context for better debugging
      if (event.user) {
        event.tags = {
          ...event.tags,
          userId: event.user.id,
        }
      }
    }

    return event
  },

  // Ignore these errors
  ignoreErrors: [
    // Prisma connection errors in dev
    'P1001',
    // Expected upload errors
    'File too large',
    'Unsupported file type',
  ],
})