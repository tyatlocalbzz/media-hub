#!/usr/bin/env node

/**
 * Helper script to set up Google Service Account key
 * Usage: node setup-service-account.js path/to/service-account-key.json
 */

const fs = require('fs');
const path = require('path');

console.log('Google Service Account Setup Helper\n');

// Check if a file path was provided
const keyFilePath = process.argv[2];

if (!keyFilePath) {
  console.log('Usage: node setup-service-account.js path/to/service-account-key.json\n');
  console.log('Steps to get your service account key:');
  console.log('1. Go to Google Cloud Console (https://console.cloud.google.com)');
  console.log('2. Select your project');
  console.log('3. Go to "IAM & Admin" > "Service Accounts"');
  console.log('4. Click on your service account');
  console.log('5. Go to "Keys" tab');
  console.log('6. Click "Add Key" > "Create new key"');
  console.log('7. Choose JSON format');
  console.log('8. Save the file and provide the path to this script\n');
  process.exit(1);
}

// Check if file exists
if (!fs.existsSync(keyFilePath)) {
  console.error(`Error: File not found: ${keyFilePath}`);
  process.exit(1);
}

try {
  // Read and parse the JSON file
  const keyFileContent = fs.readFileSync(keyFilePath, 'utf8');
  const keyJson = JSON.parse(keyFileContent);

  // Validate it's a service account key
  if (!keyJson.type || keyJson.type !== 'service_account') {
    console.error('Error: This doesn\'t appear to be a valid service account key file');
    console.error('The type should be "service_account"');
    process.exit(1);
  }

  // Extract important information
  console.log('Service Account Details:');
  console.log('------------------------');
  console.log('Project ID:', keyJson.project_id);
  console.log('Client Email:', keyJson.client_email);
  console.log('Client ID:', keyJson.client_id);
  console.log('Private Key ID:', keyJson.private_key_id);
  console.log('');

  // Convert to base64
  const base64Key = Buffer.from(keyFileContent).toString('base64');

  // Create or update .env.local
  const envPath = path.join(__dirname, '.env.local');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Update or add the service account key
  const keyLine = `GOOGLE_SERVICE_ACCOUNT_KEY=${base64Key}`;

  if (envContent.includes('GOOGLE_SERVICE_ACCOUNT_KEY=')) {
    // Replace existing key
    envContent = envContent.replace(/GOOGLE_SERVICE_ACCOUNT_KEY=.*/g, keyLine);
    console.log('Updated existing GOOGLE_SERVICE_ACCOUNT_KEY in .env.local');
  } else {
    // Add new key
    envContent += `\n# Service Account Key (base64 encoded)\n${keyLine}\n`;
    console.log('Added GOOGLE_SERVICE_ACCOUNT_KEY to .env.local');
  }

  // Check for Shared Drive ID
  if (!envContent.includes('SHARED_DRIVE_ID=') || envContent.match(/SHARED_DRIVE_ID=\s*$/m)) {
    console.log('\n⚠️  Don\'t forget to set SHARED_DRIVE_ID in .env.local');
    console.log('To get your Shared Drive ID:');
    console.log('1. Open your Shared Drive in Google Drive');
    console.log('2. Copy the ID from the URL: https://drive.google.com/drive/folders/[SHARED_DRIVE_ID]');
    console.log('3. Add to .env.local: SHARED_DRIVE_ID=your_drive_id_here');
  }

  // Write back to .env.local
  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ Service account key successfully configured!');
  console.log('\nNext steps:');
  console.log('1. Make sure your Shared Drive ID is set in .env.local');
  console.log('2. Add the service account email to your Shared Drive with Content Manager permission');
  console.log(`   Service Account Email: ${keyJson.client_email}`);
  console.log('3. Test the connection: curl http://localhost:3000/api/test-drive-sa');
  console.log('\nFor Vercel deployment:');
  console.log('Copy the following value and add it as GOOGLE_SERVICE_ACCOUNT_KEY in Vercel environment variables:');
  console.log('(First 50 chars shown for security)');
  console.log(base64Key.substring(0, 50) + '...');

} catch (error) {
  console.error('Error processing service account key:', error.message);
  process.exit(1);
}