-- Migration to remove OAuth fields for service account architecture
-- This migration removes OAuth-related fields as we're switching to service account

-- Step 1: Add new fields (if needed)
ALTER TABLE users ADD COLUMN IF NOT EXISTS folder_path TEXT;

-- Step 2: Remove OAuth-related fields (CAUTION: This will delete refresh tokens)
-- Uncomment these lines when ready to fully migrate
-- ALTER TABLE users DROP COLUMN IF EXISTS refresh_token;
-- ALTER TABLE users DROP COLUMN IF EXISTS drive_folder_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS incoming_folder_id;

-- Step 3: Add index on folder_path for performance
CREATE INDEX IF NOT EXISTS idx_users_folder_path ON users(folder_path);