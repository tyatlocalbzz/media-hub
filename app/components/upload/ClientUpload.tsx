'use client';

import { useState, useRef, useEffect } from 'react';
import type { ClientUploadProps } from './types';

export default function ClientUpload({ file, onUploadComplete, onError }: ClientUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadInProgressRef = useRef(false);
  const uploadedFileIdRef = useRef<string | null>(null);

  // Start upload automatically when file is provided
  useEffect(() => {
    // Prevent double execution in StrictMode and duplicate uploads
    if (file && !uploadInProgressRef.current) {
      // Check if this file was already uploaded in this session
      const sessionKey = `upload_${file.name}_${file.size}`;
      const existingUpload = sessionStorage.getItem(sessionKey);

      if (existingUpload) {
        try {
          const uploadData = JSON.parse(existingUpload);
          // If upload completed within last 5 minutes, don't re-upload
          if (uploadData.completed && Date.now() - uploadData.timestamp < 5 * 60 * 1000) {
            console.log('[CLIENT-UPLOAD] File already uploaded recently:', uploadData.fileId);
            setStatus('File already uploaded');
            if (onUploadComplete) {
              onUploadComplete(uploadData.fileData);
            }
            return;
          }
        } catch {
          // Invalid session data, proceed with upload
          sessionStorage.removeItem(sessionKey);
        }
      }

      console.log('[CLIENT-UPLOAD] Starting upload for file:', file.name);
      uploadInProgressRef.current = true;
      uploadToGoogleDrive(file);
    }

    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current && uploadInProgressRef.current) {
        console.log('[CLIENT-UPLOAD] Component unmounting, aborting upload');
        abortControllerRef.current.abort();
        uploadInProgressRef.current = false;
      }
    };
  }, [file, onUploadComplete]);

  // Helper function to retry with exponential backoff
  const retryWithBackoff = async <T,>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        console.log(`[CLIENT-UPLOAD] Attempt ${attempt} failed:`, error);

        if (attempt === maxRetries) {
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[CLIENT-UPLOAD] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  };

  // Upload file directly to Google Drive from client
  const uploadToGoogleDrive = async (file: File) => {
    const sessionKey = `upload_${file.name}_${file.size}`;

    try {
      setUploading(true);
      setProgress(0);
      setError(null);
      setStatus('Creating upload session...');

      // Step 1: Get upload session from our API
      const sessionResponse = await fetch('/api/files/upload-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream'
        })
      });

      if (!sessionResponse.ok) {
        const error = await sessionResponse.json();
        throw new Error(error.error || 'Failed to create upload session');
      }

      const sessionData = await sessionResponse.json();

      // Check if server detected this as a duplicate
      if (sessionData.duplicate && sessionData.file) {
        console.log('[CLIENT-UPLOAD] Server detected duplicate, skipping upload');
        const fileData = sessionData.file;

        // Save to session storage
        sessionStorage.setItem(sessionKey, JSON.stringify({
          completed: true,
          fileId: fileData.id,
          fileData: fileData,
          timestamp: Date.now()
        }));

        setProgress(100);
        setStatus('File already exists!');
        uploadedFileIdRef.current = fileData.id;
        onUploadComplete?.(fileData);

        setTimeout(() => {
          setStatus('');
          setProgress(0);
        }, 3000);

        return fileData;
      }

      const { sessionUrl, accessToken, maxChunkSize, userId } = sessionData;
      console.log('[CLIENT-UPLOAD] Session created:', { sessionUrl: sessionUrl?.substring(0, 50) + '...', maxChunkSize, userId });

      // Step 2: Upload file in chunks
      const CHUNK_SIZE = Math.min(maxChunkSize || 256 * 1024 * 1024, 256 * 1024 * 1024); // 256MB chunks
      let uploadedBytes = 0;
      abortControllerRef.current = new AbortController();

      while (uploadedBytes < file.size) {
        // Check if upload was cancelled
        if (abortControllerRef.current.signal.aborted) {
          throw new Error('Upload cancelled');
        }

        const chunkEnd = Math.min(uploadedBytes + CHUNK_SIZE, file.size);
        const chunk = file.slice(uploadedBytes, chunkEnd);

        setStatus(`Uploading ${Math.round((uploadedBytes / file.size) * 100)}%...`);

        console.log(`[CLIENT-UPLOAD] Uploading chunk: bytes ${uploadedBytes}-${chunkEnd - 1}/${file.size}`);

        // Upload chunk with retry logic
        const uploadResponse = await retryWithBackoff(async () => {
          const response = await fetch('/api/files/upload-stream', {
            method: 'PUT',
            headers: {
              'X-Session-URL': sessionUrl,
              'X-Access-Token': accessToken,
              'Content-Range': `bytes ${uploadedBytes}-${chunkEnd - 1}/${file.size}`,
              'X-Original-Content-Type': file.type || 'application/octet-stream'
            },
            body: chunk,
            signal: abortControllerRef.current?.signal
          });

          if (!response.ok && response.status >= 500) {
            // Server error - retry
            throw new Error(`Server error: ${response.status}`);
          }

          return response;
        }, 3, 2000); // 3 retries with 2 second base delay

        if (uploadResponse.ok) {
          const result = await uploadResponse.json();

          if (result.complete) {
            // Upload complete
            const fileData = result.file;
            console.log('[CLIENT-UPLOAD] Upload complete:', fileData);

            // Step 3: Save metadata to our database
            setStatus('Saving to database...');
            const saveResponse = await fetch('/api/files/save-metadata', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                driveFileId: fileData.id,
                name: fileData.name || file.name,
                mimeType: fileData.mimeType || file.type,
                size: fileData.size || file.size,
                driveUrl: fileData.webViewLink,
                thumbnailUrl: fileData.thumbnailLink
              })
            });

          if (!saveResponse.ok) {
            console.warn('[CLIENT-UPLOAD] Failed to save metadata:', await saveResponse.text());
            // Don't throw - file is uploaded, just metadata save failed
          }

          // Save to session storage
          sessionStorage.setItem(sessionKey, JSON.stringify({
            completed: true,
            fileId: fileData.id,
            fileData: fileData,
            timestamp: Date.now()
          }));

          setProgress(100);
          setStatus('Upload complete!');
          uploadedFileIdRef.current = fileData.id;
          onUploadComplete?.(fileData);

          // Reset after delay
          setTimeout(() => {
            setStatus('');
            setProgress(0);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }, 3000);

            return fileData;
          } else {
            // Chunk uploaded, continue with next chunk
            if (result.nextRange) {
              const range = result.nextRange;
              uploadedBytes = parseInt(range.split('-')[1]) + 1;
            } else {
              uploadedBytes = chunkEnd;
            }
            setProgress(Math.round((uploadedBytes / file.size) * 100));
          }
        } else {
          // Error occurred
          const errorText = await uploadResponse.text();
          throw new Error(`Upload failed: ${errorText}`);
        }
      }
    } catch (err: any) {
      console.error('[CLIENT-UPLOAD] Error:', err);

      // Clean up session storage on error
      sessionStorage.removeItem(sessionKey);

      // Provide user-friendly error messages
      let errorMessage = 'Upload failed';
      if (err.message.includes('cancelled')) {
        errorMessage = 'Upload cancelled';
      } else if (err.message.includes('Network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        errorMessage = 'Authentication expired. Please refresh the page and try again.';
      } else if (err.message.includes('413') || err.message.includes('too large')) {
        errorMessage = 'File too large for upload.';
      } else {
        errorMessage = err.message || 'Upload failed. Please try again.';
      }

      setError(errorMessage);
      setStatus('');
      onError?.(new Error(errorMessage));
    } finally {
      setUploading(false);
      uploadInProgressRef.current = false;
      abortControllerRef.current = null;
    }
  };


  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setUploading(false);
      setProgress(0);
      setStatus('Upload cancelled');
      setError(null);
    }
  };

  return (
    <div className="w-full">

      {/* Upload Progress */}
      {uploading && (
        <div className="border border-gray-300 rounded-lg p-6">
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">{status}</span>
              <span className="text-sm font-medium text-gray-700">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button
            onClick={cancelUpload}
            className="mt-2 px-4 py-2 text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Cancel Upload
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {!uploading && status === 'Upload complete!' && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800">{status}</p>
        </div>
      )}
    </div>
  );
}