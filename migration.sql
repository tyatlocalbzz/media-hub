-- Migration: Remove OAuth fields from users table
-- Run this SQL in your Supabase SQL Editor

-- Step 1: Remove OAuth-related columns that are no longer needed
-- These columns were used for OAuth2 authentication, now replaced by service account

ALTER TABLE users
DROP COLUMN IF EXISTS drive_folder_id,
DROP COLUMN IF EXISTS incoming_folder_id,
DROP COLUMN IF EXISTS refresh_token;

-- Verify the changes
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Expected remaining columns:
-- id, email, created_at, updated_at