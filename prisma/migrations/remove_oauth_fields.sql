-- Remove OAuth fields from users table
-- These fields are no longer needed with service account authentication

ALTER TABLE users
DROP COLUMN IF EXISTS drive_folder_id,
DROP COLUMN IF EXISTS incoming_folder_id,
DROP COLUMN IF EXISTS refresh_token;