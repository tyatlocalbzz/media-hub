// Configuration for Media Hub services

export const config = {
  // Google Drive settings
  drive: {
    checkInterval: 60000, // Check for new files every minute
    folders: {
      incoming: 'Incoming',
      processed: 'Processed',
      error: 'Error'
    },
    // Production limit for server-side uploads (Vercel has 4.5MB limit)
    // TESTING: Using production limit in development to test client-side uploads
    serverUploadLimit: 4.5 * 1024 * 1024, // Always use 4.5MB limit for testing
    supportedMimeTypes: [
      // Video formats
      'video/mp4',
      'video/quicktime', // .mov
      'video/x-msvideo', // .avi
      'video/webm',
      'video/x-matroska', // .mkv
      // Audio formats
      'audio/mpeg', // .mp3
      'audio/wav',
      'audio/x-wav',
      'audio/mp4', // .m4a
      'audio/x-m4a',
      'audio/ogg',
      'audio/webm'
    ],
    maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB in bytes (works in local dev, 4.5MB limit on Vercel)
    thumbnailSize: {
      width: 320,
      height: 180
    }
  },

  // Transcription service settings
  transcription: {
    service: process.env.TRANSCRIPTION_SERVICE || 'openai', // 'openai' | 'assembly' | 'google'
    maxDuration: 3600, // Maximum 1 hour
    maxConcurrent: 3, // Process up to 3 files at once
    retryAttempts: 3,
    retryDelay: 5000, // 5 seconds between retries

    // OpenAI Whisper settings
    openai: {
      model: 'whisper-1',
      temperature: 0,
      language: 'en', // Auto-detect if not specified
      responseFormat: 'verbose_json' // Get timestamps
    },

    // AssemblyAI settings (alternative)
    assembly: {
      acousticModel: 'assemblyai_default',
      languageDetection: true,
      punctuation: true,
      formatText: true,
      speakerLabels: false // Enable for speaker diarization
    }
  },

  // File processing settings
  processing: {
    tempDir: '/tmp/media-hub', // Temporary storage for processing
    cleanupInterval: 3600000, // Clean temp files every hour
    queueMaxSize: 100, // Maximum queue size
    jobTimeout: 1800000, // 30 minutes timeout for processing
    priorities: {
      low: 0,
      normal: 1,
      high: 2
    }
  },

  // Export settings
  export: {
    formats: {
      txt: {
        extension: '.txt',
        mimeType: 'text/plain',
        includeTimestamps: false
      },
      srt: {
        extension: '.srt',
        mimeType: 'application/x-subrip',
        includeTimestamps: true
      },
      vtt: {
        extension: '.vtt',
        mimeType: 'text/vtt',
        includeTimestamps: true
      },
      json: {
        extension: '.json',
        mimeType: 'application/json',
        includeTimestamps: true
      }
    },
    maxExportSize: 10 * 1024 * 1024 // 10MB max export size
  },

  // UI settings
  ui: {
    itemsPerPage: 20,
    maxUploadSize: 5 * 1024 * 1024 * 1024, // 5GB for local dev
    supportedUploadFormats: ['.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.m4a', '.ogg'],
    autoSaveInterval: 30000, // Auto-save transcript edits every 30 seconds
    toastDuration: 5000, // Show notifications for 5 seconds
  },

  // Feature flags
  features: {
    autoTranscribe: false, // Automatically process new files
    speakerDiarization: false, // Identify different speakers
    multiLanguage: false, // Support multiple languages
    collaboration: false, // Real-time collaboration
    advancedExport: true, // Advanced export options
    batchProcessing: true, // Process multiple files at once
  },

  // Rate limiting
  rateLimit: {
    transcriptionPerDay: 100, // Maximum transcriptions per day
    exportPerDay: 500, // Maximum exports per day
    apiCallsPerMinute: 60, // API rate limit
  }
}

// Helper to get config value with fallback
export function getConfig<T>(path: string, defaultValue: T): T {
  const keys = path.split('.')
  let value: any = config

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return defaultValue
    }
  }

  return value as T
}

// Validate configuration
export function validateConfig(): string[] {
  const errors: string[] = []

  if (!config.drive.maxFileSize || config.drive.maxFileSize <= 0) {
    errors.push('Invalid maxFileSize configuration')
  }

  if (!config.transcription.service) {
    errors.push('No transcription service configured')
  }

  if (config.transcription.maxConcurrent < 1) {
    errors.push('maxConcurrent must be at least 1')
  }

  return errors
}