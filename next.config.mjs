/** @type {import('next').NextConfig} */
const nextConfig = {
  // API configuration for file uploads
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Increased limit for file uploads
    },
    responseLimit: '10mb',
  },
}

export default nextConfig