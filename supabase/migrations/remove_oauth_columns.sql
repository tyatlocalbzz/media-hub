-- Migration: Remove OAuth columns from users table
-- This migration removes the old OAuth-related columns that are no longer needed
-- after switching to service account authentication

-- Drop the OAuth columns from the users table
ALTER TABLE users
DROP COLUMN IF EXISTS drive_folder_id,
DROP COLUMN IF EXISTS incoming_folder_id,
DROP COLUMN IF EXISTS refresh_token;

-- The schema should now match the Prisma schema:
-- users table will only have: id, email, created_at, updated_at