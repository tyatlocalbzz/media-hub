-- Migration: Remove OAuth columns from users table with RLS handling
-- This migration safely removes OAuth-related columns while handling RLS policies

-- Step 1: Temporarily disable RLS on users table
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop any existing policies that might reference the columns
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can delete own data" ON users;

-- Step 3: Drop the OAuth columns
ALTER TABLE users
DROP COLUMN IF EXISTS drive_folder_id,
DROP COLUMN IF EXISTS incoming_folder_id,
DROP COLUMN IF EXISTS refresh_token;

-- Step 4: Recreate the RLS policies (adjust based on your needs)
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY "Users can read own data" ON users
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Users can update their own data
CREATE POLICY "Users can update own data" ON users
    FOR UPDATE
    USING (auth.uid() = id);

-- Policy: Users can insert their own data
CREATE POLICY "Users can insert own data" ON users
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Policy: Users can delete their own data
CREATE POLICY "Users can delete own data" ON users
    FOR DELETE
    USING (auth.uid() = id);

-- The schema should now match the Prisma schema:
-- users table will only have: id, email, created_at, updated_at