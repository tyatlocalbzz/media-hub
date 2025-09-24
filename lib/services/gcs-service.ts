// Google Cloud Storage service for direct uploads
import { Storage } from '@google-cloud/storage'
import { GetSignedUrlConfig } from '@google-cloud/storage'

// Initialize GCS client
let storage: Storage | null = null

function getStorageClient(): Storage {
  if (!storage) {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured')
    }

    try {
      let credentials

      // Parse service account key (same logic as Drive service)
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY.startsWith('{')) {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
      } else {
        const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString()
        credentials = JSON.parse(decoded)
      }

      // Create storage client with credentials
      storage = new Storage({
        projectId: credentials.project_id,
        credentials: {
          client_email: credentials.client_email,
          private_key: credentials.private_key
        }
      })

      console.log('[GCS Service] Storage client initialized')
    } catch (error) {
      console.error('[GCS Service] Failed to initialize:', error)
      throw new Error('Failed to initialize Google Cloud Storage')
    }
  }

  return storage
}

// Get or create staging bucket
export async function getStagingBucket(): Promise<string> {
  const bucketName = process.env.GCS_BUCKET_NAME || 'media-hub-staging'
  const storage = getStorageClient()
  const bucket = storage.bucket(bucketName)

  try {
    // Check if bucket exists
    const [exists] = await bucket.exists()

    if (!exists) {
      console.log('[GCS Service] Creating bucket:', bucketName)

      // Create bucket with appropriate settings
      await storage.createBucket(bucketName, {
        location: 'US', // Multi-region for better availability
        storageClass: 'STANDARD',
        uniformBucketLevelAccess: {
          enabled: true // Better security
        },
        lifecycle: {
          rule: [
            {
              action: { type: 'Delete' },
              condition: { age: 7 } // Auto-delete after 7 days
            }
          ]
        }
      })

      console.log('[GCS Service] Bucket created successfully')
    }

    // Set CORS configuration for browser uploads
    await bucket.setCorsConfiguration([
      {
        origin: [
          process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'https://*.vercel.app' // Allow Vercel preview deployments
        ],
        method: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
        responseHeader: ['Content-Type', 'Content-Range', 'Accept-Ranges'],
        maxAgeSeconds: 3600
      }
    ])

    return bucketName
  } catch (error) {
    console.error('[GCS Service] Bucket operation failed:', error)

    // If bucket exists but we can't modify it, still return the name
    if ((error as any).code === 409) {
      return bucketName
    }

    throw error
  }
}

// Generate a signed URL for direct upload
export async function generateSignedUploadUrl(
  fileName: string,
  contentType: string,
  contentLength: number,
  userId: string
): Promise<{
  uploadUrl: string
  fileKey: string
  bucketName: string
}> {
  const storage = getStorageClient()
  const bucketName = await getStagingBucket()
  const bucket = storage.bucket(bucketName)

  // Generate unique file key
  const timestamp = Date.now()
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const fileKey = `uploads/${userId}/${timestamp}-${sanitizedFileName}`

  const file = bucket.file(fileKey)

  // Configuration for signed URL
  const config: GetSignedUrlConfig = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour expiry
    contentType: contentType,
    extensionHeaders: {
      'x-goog-content-length-range': `0,${contentLength}` // Enforce size limit
    }
  }

  try {
    const [uploadUrl] = await file.getSignedUrl(config)

    console.log('[GCS Service] Generated signed URL for:', fileKey)

    return {
      uploadUrl,
      fileKey,
      bucketName
    }
  } catch (error) {
    console.error('[GCS Service] Failed to generate signed URL:', error)
    throw new Error('Failed to generate upload URL')
  }
}

// Generate signed URL for resumable upload (for large files)
export async function generateResumableUploadUrl(
  fileName: string,
  contentType: string,
  contentLength: number,
  userId: string
): Promise<{
  uploadUrl: string
  fileKey: string
  bucketName: string
}> {
  const storage = getStorageClient()
  const bucketName = await getStagingBucket()
  const bucket = storage.bucket(bucketName)

  // Generate unique file key
  const timestamp = Date.now()
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const fileKey = `uploads/${userId}/${timestamp}-${sanitizedFileName}`

  const file = bucket.file(fileKey)

  // For resumable uploads, we need a different approach
  // GCS resumable uploads work differently than signed URLs
  const config: GetSignedUrlConfig = {
    version: 'v4',
    action: 'resumable',
    expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours for large files
    contentType: contentType,
    extensionHeaders: {
      'x-goog-content-length-range': `0,${contentLength}`
    }
  }

  try {
    const [uploadUrl] = await file.getSignedUrl(config)

    console.log('[GCS Service] Generated resumable URL for:', fileKey)

    return {
      uploadUrl,
      fileKey,
      bucketName
    }
  } catch (error) {
    console.error('[GCS Service] Failed to generate resumable URL:', error)
    throw new Error('Failed to generate resumable upload URL')
  }
}

// Download file from GCS (for processing)
export async function downloadFile(
  bucketName: string,
  fileKey: string
): Promise<Buffer> {
  const storage = getStorageClient()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(fileKey)

  try {
    const [buffer] = await file.download()
    console.log('[GCS Service] Downloaded file:', fileKey)
    return buffer
  } catch (error) {
    console.error('[GCS Service] Failed to download file:', error)
    throw new Error('Failed to download file from storage')
  }
}

// Stream file from GCS (for large files)
export function createReadStream(
  bucketName: string,
  fileKey: string
): NodeJS.ReadableStream {
  const storage = getStorageClient()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(fileKey)

  return file.createReadStream()
}

// Delete file from GCS
export async function deleteFile(
  bucketName: string,
  fileKey: string
): Promise<void> {
  const storage = getStorageClient()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(fileKey)

  try {
    await file.delete()
    console.log('[GCS Service] Deleted file:', fileKey)
  } catch (error) {
    console.error('[GCS Service] Failed to delete file:', error)
    // Don't throw - file might already be deleted
  }
}

// Check if file exists
export async function fileExists(
  bucketName: string,
  fileKey: string
): Promise<boolean> {
  const storage = getStorageClient()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(fileKey)

  try {
    const [exists] = await file.exists()
    return exists
  } catch (error) {
    console.error('[GCS Service] Failed to check file existence:', error)
    return false
  }
}

// Export service functions
export const gcsService = {
  getStorageClient,
  getStagingBucket,
  generateSignedUploadUrl,
  generateResumableUploadUrl,
  downloadFile,
  createReadStream,
  deleteFile,
  fileExists
}