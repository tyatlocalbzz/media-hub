/** @type {import('next').NextConfig} */
const nextConfig = {
  // Other Next.js config options
  experimental: {
    // Enable server actions if needed
    serverActions: {
      bodySizeLimit: '10mb'
    }
  }
}

export default nextConfig