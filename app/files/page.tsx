'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FileList } from '@/app/components/FileList';
import { SyncStatus } from '@/app/components/SyncStatus';
import { dedupedFetch } from '@/lib/utils/request-cache';

interface FileData {
  id: string;
  name: string;
  mimeType: string | null;
  size: string | null;
  duration: number | null;
  status: 'NEW' | 'TRANSCRIBING' | 'READY';
  thumbnailUrl: string | null;
  driveUrl: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
  isDeleted: boolean;
}

interface SyncData {
  lastSync: {
    id: string;
    startedAt: string;
    completedAt: string | null;
    filesAdded: number;
    filesUpdated: number;
    filesDeleted: number;
    error: string | null;
  } | null;
  totalFiles: number;
}

export default function FilesPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [files, setFiles] = useState<FileData[]>([]);
  const [lastSyncData, setLastSyncData] = useState<SyncData | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Refs to prevent duplicate operations
  const syncInProgressRef = useRef(false);
  const initialLoadRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load files from database
  const loadFiles = useCallback(async () => {
    try {
      const data = await dedupedFetch(
        'files-list',
        async () => {
          const response = await fetch('/api/files');
          if (!response.ok) {
            throw new Error('Failed to load files');
          }
          return response.json();
        },
        { ttl: 2000 } // 2 second deduplication window
      );
      setFiles(data.files || []);
    } catch (err) {
      console.error('Error loading files:', err);
      setError('Failed to load files');
    }
  }, []);

  // Load sync status
  const loadSyncStatus = useCallback(async () => {
    try {
      const data = await dedupedFetch(
        'sync-status',
        async () => {
          const response = await fetch('/api/files/sync');
          if (!response.ok) {
            throw new Error('Failed to load sync status');
          }
          return response.json();
        },
        { ttl: 2000 } // 2 second deduplication window
      );
      setLastSyncData(data);
    } catch (err) {
      console.error('Error loading sync status:', err);
    }
  }, []);

  // Sync with Google Drive
  const syncFiles = useCallback(async () => {
    // Prevent duplicate sync operations
    if (syncInProgressRef.current) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    syncInProgressRef.current = true;
    setSyncing(true);
    setError(null);

    // Create abort controller for this sync
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/files/sync', {
        method: 'POST',
        signal: abortController.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync failed');
      }

      const result = await response.json();
      console.log('Sync result:', result.stats);

      // Reload files and sync status
      await Promise.all([loadFiles(), loadSyncStatus()]);

      // Show success message
      if (result.stats.filesAdded > 0 || result.stats.filesUpdated > 0) {
        setError(null); // Clear any previous errors
      }
    } catch (err: any) {
      // Don't show error if request was aborted
      if (err.name === 'AbortError') {
        console.log('Sync aborted');
      } else {
        console.error('Sync error:', err);
        setError(err instanceof Error ? err.message : 'Failed to sync files');
      }
    } finally {
      setSyncing(false);
      syncInProgressRef.current = false;
      abortControllerRef.current = null;
    }
  }, [loadFiles, loadSyncStatus]);

  // Delete file
  const handleDeleteFile = useCallback(async (fileId: string) => {
    if (!confirm('Are you sure you want to remove this file from tracking?')) {
      return;
    }

    try {
      const response = await fetch('/api/files', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileId })
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      // Remove from local state
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (err) {
      console.error('Error deleting file:', err);
      setError('Failed to delete file');
    }
  }, []);

  // Process file (placeholder for transcription)
  const handleProcessFile = useCallback(async (fileId: string) => {
    console.log('Process file:', fileId);
    // TODO: Implement transcription processing
    alert('Transcription feature coming soon!');
  }, []);

  // Check auth and initial load
  useEffect(() => {
    // Prevent duplicate initial load in StrictMode
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Load initial data sequentially to avoid race conditions
      await loadFiles();
      await loadSyncStatus();
      setLoading(false);

      // Only trigger initial sync if no files and no previous sync
      setTimeout(() => {
        if (files.length === 0 && !lastSyncData?.lastSync) {
          syncFiles();
        }
      }, 100);
    };

    checkAuth();

    // Cleanup function
    return () => {
      syncInProgressRef.current = false;
      // Abort any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []); // Empty deps intentionally - we only want this to run once

  // Auto-sync effect with debouncing
  useEffect(() => {
    if (!autoSync) return;

    // Initial sync after enabling
    const initialTimer = setTimeout(() => {
      syncFiles();
    }, 1000); // Wait 1 second before first sync

    // Set up recurring sync
    const interval = setInterval(() => {
      // Only sync if not already syncing
      if (!syncInProgressRef.current) {
        syncFiles();
      }
    }, 60000); // Sync every minute

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [autoSync, syncFiles]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Media Files</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {lastSyncData?.totalFiles || 0} files synced from Google Drive
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setError(null)}
                  className="inline-flex text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Dismiss</span>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sync Status Bar */}
        <div className="mb-6">
          <SyncStatus
            onSync={syncFiles}
            autoSync={autoSync}
            onAutoSyncChange={setAutoSync}
            lastSyncTime={lastSyncData?.lastSync?.completedAt ? new Date(lastSyncData.lastSync.completedAt) : null}
          />
        </div>

        {/* Stats Cards */}
        {lastSyncData?.lastSync && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Files Added</p>
                  <p className="mt-1 text-2xl font-semibold text-green-600">
                    +{lastSyncData.lastSync.filesAdded}
                  </p>
                </div>
                <div className="text-3xl">📥</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Files Updated</p>
                  <p className="mt-1 text-2xl font-semibold text-blue-600">
                    {lastSyncData.lastSync.filesUpdated}
                  </p>
                </div>
                <div className="text-3xl">🔄</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Files Removed</p>
                  <p className="mt-1 text-2xl font-semibold text-red-600">
                    -{lastSyncData.lastSync.filesDeleted}
                  </p>
                </div>
                <div className="text-3xl">🗑️</div>
              </div>
            </div>
          </div>
        )}

        {/* File List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <FileList
            files={files}
            loading={loading || syncing}
            onDelete={handleDeleteFile}
            onProcess={handleProcessFile}
          />
        </div>
      </div>
    </div>
  );
}