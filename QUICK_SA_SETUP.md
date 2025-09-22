# Quick Service Account Setup

You currently have an invalid service account key in your `.env.local`. Follow these steps to fix it:

## Step 1: Get Service Account Key from Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create a new one)
3. Enable Google Drive API:
   - Click the hamburger menu ☰
   - Go to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click on it and click "Enable"

4. Create a Service Account:
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "+ CREATE SERVICE ACCOUNT"
   - Name: `media-hub-service`
   - Click "Create and Continue"
   - Skip the optional steps, click "Done"

5. Generate the key:
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose **JSON**
   - A JSON file will download - save it somewhere safe

## Step 2: Configure the Key

Run the setup helper script with your downloaded JSON file:

```bash
node setup-service-account.js ~/Downloads/your-service-account-key.json
```

This script will:
- Validate your service account key
- Convert it to base64
- Update your `.env.local` automatically

## Step 3: Set Up Shared Drive

1. Go to [Google Drive](https://drive.google.com)
2. Create a Shared Drive (if you don't have one):
   - Click "Shared drives" in the left sidebar
   - Click the "+" button
   - Name it "Media Hub Storage"
   - Click "Create"

3. Add your service account:
   - Open the Shared Drive
   - Click the settings icon (⚙️)
   - Click "Manage members"
   - Add the service account email (shown by the setup script)
   - Set role to "Content Manager"
   - Click "Share"

4. Get the Shared Drive ID:
   - While in the Shared Drive, look at the URL
   - Copy the ID: `https://drive.google.com/drive/folders/[THIS_IS_THE_ID]`
   - Add to `.env.local`: `SHARED_DRIVE_ID=your_id_here`

## Step 4: Test

```bash
# Restart your dev server
npm run dev

# Test the connection
curl http://localhost:3000/api/test-drive-sa
```

You should see a success response with the service account details.

## What Went Wrong Before?

Your current `GOOGLE_SERVICE_ACCOUNT_KEY` value (`d210f03685be65ea1754af3266849809ad5ec132`) is not a valid service account key. It should be either:
1. A base64-encoded JSON string (very long, usually 2000+ characters)
2. The actual JSON content (starts with `{`)

## Troubleshooting

If you still get errors:

1. **"Invalid service account key format"**
   - Make sure you downloaded the JSON format, not P12
   - Use the setup script to properly encode it

2. **"Permission denied" errors**
   - Make sure the service account has "Content Manager" permission on the Shared Drive
   - Verify the Drive API is enabled in Google Cloud Console

3. **"Shared Drive not found"**
   - Double-check the SHARED_DRIVE_ID in your `.env.local`
   - Make sure it's the ID from the URL, not the name

## Alternative: Use JSON Directly (for testing)

If you prefer, you can paste the JSON directly in `.env.local` (less secure, only for testing):

```env
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project",...}
SHARED_DRIVE_ID=your_drive_id
```

But using base64 encoding (via the setup script) is more secure and recommended.