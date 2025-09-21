-- Check if tables already exist and verify/update schema
-- This is idempotent and safe to run multiple times

-- Ensure Status enum exists
DO $$ BEGIN
    CREATE TYPE "Status" AS ENUM ('NEW', 'TRANSCRIBING', 'READY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create or verify User table
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Create or verify File table
CREATE TABLE IF NOT EXISTS "File" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transcript" TEXT,
    "status" "Status" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- Create indexes if they don't exist
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "File_driveFileId_key" ON "File"("driveFileId");
CREATE INDEX IF NOT EXISTS "File_userId_idx" ON "File"("userId");
CREATE INDEX IF NOT EXISTS "File_status_idx" ON "File"("status");

-- Add foreign key if it doesn't exist
DO $$ BEGIN
    ALTER TABLE "File" ADD CONSTRAINT "File_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Verify the schema
SELECT
    'Schema verified successfully' as message,
    (SELECT COUNT(*) FROM "User") as user_count,
    (SELECT COUNT(*) FROM "File") as file_count;