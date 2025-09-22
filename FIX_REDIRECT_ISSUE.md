# Fix Authentication Redirect Issue

## Problem
After login, users are being redirected to an old Vercel preview deployment URL (`https://media-ehhbiy252-ty-walls-projects-6791d3b7.vercel.app`) instead of the production URL (`https://media-hub-smoky.vercel.app`).

This old deployment still has:
- The deleted `/api/files/upload-session` route
- References to removed database columns like `refresh_token`
- Old OAuth authentication code

## Solution - Manual Steps Required

### 1. Update Supabase Dashboard (REQUIRED)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **URL Configuration**
4. Update these fields:
   - **Site URL**:
     - FROM: `https://media-ehhbiy252-ty-walls-projects-6791d3b7.vercel.app`
     - TO: `https://media-hub-smoky.vercel.app`

   - **Redirect URLs** (in the allowlist):
     - REMOVE: `https://media-ehhbiy252-ty-walls-projects-6791d3b7.vercel.app/api/auth/callback`
     - ADD: `https://media-hub-smoky.vercel.app/api/auth/callback`
     - Also add localhost for development: `http://localhost:3000/api/auth/callback`

5. Click **Save** to apply changes

### 2. Update Vercel Environment Variables (REQUIRED)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your `media-hub` project
3. Go to **Settings** → **Environment Variables**
4. Find and update `NEXT_PUBLIC_SITE_URL`:
   - FROM: `https://media-ehhbiy252-ty-walls-projects-6791d3b7.vercel.app`
   - TO: `https://media-hub-smoky.vercel.app`
5. Click **Save**
6. **Redeploy** your application for the changes to take effect:
   - Go to the **Deployments** tab
   - Click the three dots menu on the latest deployment
   - Select **Redeploy**

### 3. Clear Browser Cache (RECOMMENDED)

After making the above changes:
1. Clear your browser cache and cookies for the domain
2. Or use an incognito/private window to test

## Verification

After completing these steps:
1. Go to `https://media-hub-smoky.vercel.app/login`
2. Sign in with Google
3. You should be redirected to `https://media-hub-smoky.vercel.app/dashboard` (NOT the old URL)
4. Upload functionality should work without errors

## Note
The `.env.production.example` file has been updated with the correct URL for future reference.