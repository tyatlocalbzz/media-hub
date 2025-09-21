'use client'

import { useState, useEffect } from 'react'

interface SyncStatusProps {
  onSync: () => Promise<void>
  autoSync?: boolean
  onAutoSyncChange?: (enabled: boolean) => void
  lastSyncTime?: Date | null
}

export function SyncStatus({ onSync, autoSync = false, onAutoSyncChange, lastSyncTime }: SyncStatusProps) {
  const [syncing, setSyncing] = useState(false)
  const [timeAgo, setTimeAgo] = useState<string>('')

  useEffect(() => {
    if (!lastSyncTime) return

    const updateTimeAgo = () => {
      const now = new Date()
      const diff = now.getTime() - new Date(lastSyncTime).getTime()
      const seconds = Math.floor(diff / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)
      const days = Math.floor(hours / 24)

      if (days > 0) {
        setTimeAgo(`${days} day${days > 1 ? 's' : ''} ago`)
      } else if (hours > 0) {
        setTimeAgo(`${hours} hour${hours > 1 ? 's' : ''} ago`)
      } else if (minutes > 0) {
        setTimeAgo(`${minutes} minute${minutes > 1 ? 's' : ''} ago`)
      } else if (seconds > 0) {
        setTimeAgo(`${seconds} second${seconds > 1 ? 's' : ''} ago`)
      } else {
        setTimeAgo('just now')
      }
    }

    updateTimeAgo()
    const interval = setInterval(updateTimeAgo, 10000) // Update every 10 seconds

    return () => clearInterval(interval)
  }, [lastSyncTime])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await onSync()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="flex items-center space-x-4">
        {/* Sync Button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors
            ${syncing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
            }
          `}
        >
          <svg
            className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {syncing ? 'Syncing...' : 'Sync with Drive'}
        </button>

        {/* Last Sync Info */}
        {lastSyncTime && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Last sync:</span> {timeAgo}
          </div>
        )}
      </div>

      {/* Auto Sync Toggle */}
      {onAutoSyncChange && (
        <div className="flex items-center space-x-2">
          <label htmlFor="auto-sync" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Auto-sync
          </label>
          <button
            id="auto-sync"
            role="switch"
            aria-checked={autoSync}
            onClick={() => onAutoSyncChange(!autoSync)}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${autoSync ? 'bg-blue-600' : 'bg-gray-200'}
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${autoSync ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        </div>
      )}
    </div>
  )
}