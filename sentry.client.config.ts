// This file configures the initialization of Sentry on the client side.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampleRate for a dynamic rate
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  replaysOnErrorSampleRate: 1.0,

  // This is the sample rate for replays - 0.1 means 10% of sessions are recorded
  replaysSessionSampleRate: 0.1,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: false,
    }),
  ],

  // Filter out noisy errors
  beforeSend(event, hint) {
    // Filter out network errors that are expected during uploads
    if (hint.originalException && hint.originalException instanceof Error) {
      const error = hint.originalException

      // Don't report user-cancelled uploads
      if (error.message?.includes('Upload was aborted')) {
        return null
      }

      // Don't report rate limit errors (they're expected)
      if (error.message?.includes('Rate limit exceeded')) {
        return null
      }
    }

    return event
  },

  // Ignore these errors
  ignoreErrors: [
    // Browser extensions
    'chrome-extension',
    'moz-extension',
    // Network errors
    'NetworkError',
    'Failed to fetch',
    // User actions
    'Non-Error promise rejection captured',
  ],
})