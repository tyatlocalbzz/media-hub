# Phase 2: Media Processing Implementation

## 📋 Overview
Implement the core functionality: monitoring Google Drive for media files, processing them through transcription services, and managing the transcripts.

## ✅ Phase 1 Complete
- Google OAuth authentication
- Automatic Drive folder creation (/Media Hub/Incoming)
- User dashboard with mindful moments
- Database setup with Prisma
- Protected routes and session management

## 🎯 Phase 2 Goals

### Core Features to Implement
1. **File Monitoring**
   - Watch "Media Hub/Incoming" folder for new files
   - Sync file metadata to database
   - Support video and audio formats

2. **Transcription Processing**
   - Send media files to transcription service
   - Track processing status
   - Handle errors gracefully

3. **Transcript Management**
   - Display transcripts in UI
   - Edit and save transcripts
   - Export in multiple formats (TXT, SRT, JSON)

4. **File Organization**
   - Move processed files to "Completed" folder
   - Archive old transcripts
   - Batch operations

## 🛠 Technical Decisions Needed

### Transcription Service
Choose one:
- [ ] OpenAI Whisper API (Most accurate, $$)
- [ ] AssemblyAI (Good features, $)
- [ ] Google Speech-to-Text (Integrated with Drive)
- [ ] Self-hosted Whisper (Cheapest, needs server)

### Processing Architecture
Choose approach:
- [ ] Client-side polling (Simple, not scalable)
- [ ] Server-side cron jobs (Better for background)
- [ ] Webhook from Drive (Real-time, complex)
- [ ] Manual trigger (User control, simpler)

### File Handling
Decide on:
- Maximum file size: _____ MB
- Supported formats: MP4, MOV, MP3, WAV, M4A
- Temporary storage: Vercel /tmp or stream directly
- Concurrent processing limit: _____

## 📁 File Structure to Add

```
app/
├── api/
│   ├── files/
│   │   ├── sync/route.ts       # Sync with Drive
│   │   ├── process/route.ts    # Start transcription
│   │   └── [id]/route.ts        # Single file operations
│   └── transcripts/
│       ├── route.ts             # List transcripts
│       └── [id]/
│           ├── route.ts         # Get/update transcript
│           └── export/route.ts # Export formats
├── files/
│   └── [id]/
│       └── page.tsx            # Single file view with transcript
lib/
├── services/
│   ├── drive.ts               # Google Drive operations
│   ├── transcription.ts       # Transcription service wrapper
│   └── processing.ts          # Queue and job management
└── hooks/
    ├── useFiles.ts            # File list management
    └── useTranscript.ts       # Transcript operations
```

## 🔌 API Endpoints

### File Management
- `GET /api/files` - List user's files
- `POST /api/files/sync` - Sync with Drive folder
- `GET /api/files/[id]` - Get file details
- `POST /api/files/[id]/process` - Start transcription
- `DELETE /api/files/[id]` - Remove file

### Transcript Management
- `GET /api/transcripts` - List all transcripts
- `GET /api/transcripts/[id]` - Get transcript
- `PUT /api/transcripts/[id]` - Update transcript
- `POST /api/transcripts/[id]/export` - Export (format: txt|srt|json)

## 📊 Database Updates

```prisma
model File {
  // Existing fields...
  mimeType      String?
  size          BigInt?
  duration      Int?        // seconds
  driveUrl      String?
  thumbnailUrl  String?
  error         String?
  processedAt   DateTime?

  // Relations
  jobs          Job[]
}

model Job {
  id            String   @id @default(cuid())
  fileId        String
  type          JobType  // TRANSCRIPTION, EXPORT
  status        JobStatus
  startedAt     DateTime @default(now())
  completedAt   DateTime?
  error         String?
  metadata      Json?

  file          File     @relation(fields: [fileId], references: [id])
}

enum JobType {
  TRANSCRIPTION
  EXPORT
  MOVE
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

## 🚀 Implementation Steps

### Week 1: File Sync
1. [ ] Implement Drive API file listing
2. [ ] Create sync endpoint
3. [ ] Update files page to show real files
4. [ ] Add file status indicators

### Week 2: Transcription
1. [ ] Set up transcription service
2. [ ] Create processing queue
3. [ ] Implement job status tracking
4. [ ] Add progress indicators

### Week 3: Transcript UI
1. [ ] Create transcript viewer
2. [ ] Add editing capabilities
3. [ ] Implement export formats
4. [ ] Add search functionality

### Week 4: Polish
1. [ ] Error handling and retry logic
2. [ ] Batch operations
3. [ ] Performance optimization
4. [ ] User notifications

## 🧪 Testing Checklist
- [ ] Upload various file formats
- [ ] Test large files (>100MB)
- [ ] Concurrent processing
- [ ] Error recovery
- [ ] Export formats
- [ ] Edit and save transcripts

## 📝 Environment Variables Needed

```env
# Transcription Service
OPENAI_API_KEY=
# OR
ASSEMBLY_AI_API_KEY=
# OR
GOOGLE_SPEECH_API_KEY=

# Processing
MAX_FILE_SIZE=524288000  # 500MB in bytes
MAX_CONCURRENT_JOBS=3
PROCESSING_TIMEOUT=3600  # 1 hour in seconds

# Optional: Background Jobs
CRON_SECRET=            # For Vercel Cron
WEBHOOK_SECRET=         # For Drive webhooks
```

## 🎨 UI Components Needed
- File list with status badges
- Transcript viewer with timestamps
- Edit mode with auto-save
- Export dialog with format options
- Processing progress indicator
- Error state displays

## 📚 Resources
- [Google Drive API](https://developers.google.com/drive/api/v3/reference)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [AssemblyAI Docs](https://www.assemblyai.com/docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

## 🤔 Questions to Answer
1. Should processing start automatically or require user trigger?
2. Keep original files in Incoming or move to Processed?
3. How long to retain transcripts?
4. Support real-time collaboration on transcripts?
5. Add speaker diarization (identify different speakers)?

---

*Ready to start Phase 2? Pick a transcription service and start with the file sync implementation!*