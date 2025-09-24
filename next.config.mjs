import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sentry needs these for error reporting
  productionBrowserSourceMaps: true,

  // Other Next.js config options
  experimental: {
    // Enable server actions if needed
    serverActions: {
      bodySizeLimit: '10mb'
    }
  }
}

// Sentry configuration wrapper
export default withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Suppresses source map uploading logs during build
    silent: true,

    // Upload source maps to Sentry
    org: process.env.SENTRY_ORG || 'media-hub',
    project: process.env.SENTRY_PROJECT || 'media-hub-app',

    // Routes to tunnel Sentry requests through our server to avoid ad-blockers
    tunnelRoute: '/monitoring',

    // Hides source maps from public access
    hideSourceMaps: true,

    // Disables automatic instrumentation
    disableLogger: false,
  },
  {
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    widenClientFileUpload: true,

    // Transpiles SDK to be compatible with IE11 (if needed)
    transpileClientSDK: true,

    // Uncomment to route browser requests through a custom route
    // tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors
    automaticVercelMonitors: true,
  }
)