-- Migration: Remove OAuth fields from public.users table
-- Run this SQL in your Supabase SQL Editor

-- First, check if the columns exist in the public.users table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- If you see drive_folder_id, incoming_folder_id, or refresh_token columns,
-- then run this to remove them:
ALTER TABLE public.users
DROP COLUMN IF EXISTS drive_folder_id,
DROP COLUMN IF EXISTS incoming_folder_id,
DROP COLUMN IF EXISTS refresh_token;

-- Verify the changes worked
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- Expected columns after migration:
-- id, email, created_at, updated_at

-- Note: The auth.users table (managed by Supabase) is separate
-- from your public.users table (your app's custom table)