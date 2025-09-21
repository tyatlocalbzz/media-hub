'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface QuickOnboardingProps {
  driveFolderId?: string
  onComplete?: () => void
}

export function QuickOnboarding({ driveFolderId, onComplete }: QuickOnboardingProps) {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [currentMessage, setCurrentMessage] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  const messages = [
    "Setting up your private storage...",
    "Your files stay in YOUR Drive...",
    "✓ You own everything!"
  ]

  useEffect(() => {
    // Start progress animation
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval)
          return 100
        }
        return prev + 100 / 15 // Complete in 1.5 seconds
      })
    }, 100)

    // Change messages
    const messageTimers = [
      setTimeout(() => setCurrentMessage(1), 800),
      setTimeout(() => setCurrentMessage(2), 1600),
      setTimeout(() => setIsComplete(true), 1500),
    ]

    // Hide and clean up
    const hideTimer = setTimeout(() => {
      // Remove onboarding parameter from URL
      const url = new URL(window.location.href)
      url.searchParams.delete('onboarding')
      url.searchParams.delete('folder')
      router.replace(url.pathname)

      // Call onComplete to hide the overlay
      if (onComplete) {
        onComplete()
      }
    }, 2500)

    return () => {
      clearInterval(progressInterval)
      messageTimers.forEach(clearTimeout)
      clearTimeout(hideTimer)
    }
  }, [router])

  const driveFolderLink = driveFolderId
    ? `https://drive.google.com/drive/folders/${driveFolderId}`
    : 'https://drive.google.com/drive/my-drive'

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 animate-scaleIn">
        <div className="text-center">
          {/* Icon */}
          <div className="mb-4 text-4xl">
            {isComplete ? (
              <span className="animate-scaleIn inline-block">✓</span>
            ) : (
              <div className="inline-block animate-spin">
                <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            )}
          </div>

          {/* Message */}
          <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-100 transition-all">
            {isComplete ? 'Media Hub is ready!' : 'Setting up your Media Hub...'}
          </h2>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 h-5 transition-all">
            {messages[currentMessage]}
          </p>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Drive Link (shows when complete) */}
          {isComplete && (
            <a
              href={driveFolderLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-500 hover:text-blue-600 transition-colors animate-fadeIn"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7.71 3.52L1.15 15l6.56 6.48L14.29 10l-6.58-6.48zm6.58 6.48l6.56 11.48L14.29 10zm.01 0L21 21.48 14.3 10z"/>
              </svg>
              Open in Google Drive
            </a>
          )}
        </div>
      </div>
    </div>
  )
}