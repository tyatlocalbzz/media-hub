# Service Account Setup Guide

This guide walks you through setting up a Google Service Account for Media Hub, which eliminates OAuth complexity and provides more reliable file management.

## Prerequisites

- Google Workspace account (for Shared Drive support)
- Admin access to Google Cloud Console
- Admin access to Google Workspace Admin Console (for Shared Drive)

## Step 1: Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable Google Drive API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

4. Create Service Account:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Name: `media-hub-service`
   - Description: "Service account for Media Hub application"
   - Click "Create and Continue"
   - Skip optional steps, click "Done"

5. Generate Service Account Key:
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose "JSON" format
   - Save the downloaded JSON file securely

## Step 2: Set Up Shared Drive

1. Go to [Google Drive](https://drive.google.com)
2. Create a Shared Drive:
   - Click "Shared drives" in sidebar
   - Click "New" button
   - Name: "Media Hub Storage"
   - Click "Create"

3. Add Service Account to Shared Drive:
   - Right-click on the Shared Drive
   - Click "Manage members"
   - Add the service account email (found in the JSON key file)
   - Set permission to "Content Manager"
   - Click "Send"

4. Get Shared Drive ID:
   - Open the Shared Drive
   - Copy the ID from the URL: `https://drive.google.com/drive/folders/[SHARED_DRIVE_ID]`

## Step 3: Configure Environment Variables

1. Convert service account key to base64:
```bash
# On Mac/Linux
cat service-account-key.json | base64 > sa-key-base64.txt

# On Windows (PowerShell)
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content service-account-key.json -Raw))) > sa-key-base64.txt
```

2. Add to `.env.local`:
```env
# Service Account Configuration
GOOGLE_SERVICE_ACCOUNT_KEY=<paste-base64-encoded-key-here>
SHARED_DRIVE_ID=<your-shared-drive-id>

# Optional: Set a specific root folder
MEDIA_HUB_ROOT_FOLDER_ID=<optional-folder-id>
```

3. Add to Vercel:
   - Go to your Vercel project settings
   - Navigate to "Environment Variables"
   - Add the same variables for Production environment

## Step 4: Test Connection

Run the test endpoint to verify setup:

```bash
# Local test
curl http://localhost:3000/api/test-drive-sa

# Production test
curl https://your-app.vercel.app/api/test-drive-sa
```

Expected response:
```json
{
  "success": true,
  "user": {
    "displayName": "media-hub-service",
    "emailAddress": "media-hub-service@your-project.iam.gserviceaccount.com"
  },
  "serviceAccount": true
}
```

## Folder Structure

The service account will automatically create this structure in your Shared Drive:

```
Media Hub Storage (Shared Drive)
├── Media Hub/
│   ├── user1_at_example.com/
│   │   ├── Incoming/
│   │   └── Processed/
│   ├── user2_at_example.com/
│   │   ├── Incoming/
│   │   └── Processed/
```

## Benefits Over OAuth

✅ **No token refresh issues** - Service accounts don't expire
✅ **Simpler implementation** - No OAuth flow complexity
✅ **Better reliability** - No user-specific authentication failures
✅ **Centralized management** - IT admins can manage all files
✅ **Unlimited storage** - Uses organization's pooled storage

## Migration from OAuth

If migrating from OAuth-based system:

1. Export user file metadata from database
2. Use Drive API to transfer files from user Drives to Shared Drive
3. Update database with new file locations
4. Remove OAuth refresh tokens from database

## Troubleshooting

### "GOOGLE_SERVICE_ACCOUNT_KEY environment variable not configured"
- Ensure the base64 encoded key is properly set in environment variables
- Check for line breaks in the base64 string (should be one continuous line)

### "Failed to initialize Google Drive service account"
- Verify the JSON key is valid
- Check that the service account has Drive API enabled
- Ensure base64 encoding was done correctly

### "No files showing up"
- Verify service account has access to the Shared Drive
- Check that files are in the correct folder structure
- Ensure proper permissions (Content Manager or Manager role)

### Rate Limiting
- Service accounts have higher rate limits than OAuth
- Implement exponential backoff for API calls
- Consider batching operations when possible

## Security Best Practices

1. **Never commit service account keys to version control**
2. **Rotate keys periodically** (every 90 days recommended)
3. **Use least privilege principle** - only grant necessary permissions
4. **Monitor usage** through Google Cloud Console
5. **Set up alerts** for unusual activity

## Support

For issues or questions:
- Check Google Cloud Console logs
- Review Drive API quotas and usage
- Contact your Google Workspace administrator