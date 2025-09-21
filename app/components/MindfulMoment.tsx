'use client'

import { useEffect, useState, useRef } from 'react'
import { getRandomQuote, Quote } from '@/lib/quotes'

interface MindfulMomentProps {
  userName?: string | null
  onComplete?: () => void
}

export function MindfulMoment({ userName, onComplete }: MindfulMomentProps) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [showTimer, setShowTimer] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(300) // 5 minutes
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const handleClose = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setIsRunning(false)
    setIsExiting(true)

    setTimeout(() => {
      if (onComplete) {
        onComplete()
      }
    }, 300)
  }

  const toggleMeditation = () => {
    if (showTimer && isRunning) {
      // If meditation is running, stop it
      setIsRunning(false)
      if (intervalRef.current) clearInterval(intervalRef.current)
      setShowTimer(false)
      setTimeRemaining(300)
    } else if (showTimer) {
      // If timer is shown but paused, hide it
      setShowTimer(false)
      setTimeRemaining(300)
    } else {
      // Show and start timer
      setShowTimer(true)
      setIsRunning(true)
    }
  }

  useEffect(() => {
    // Get random quote
    setQuote(getRandomQuote())

    // Trigger entrance animation
    setTimeout(() => setIsVisible(true), 100)

    // Add escape key handler
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Timer countdown
  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setIsRunning(false)
            setShowTimer(false)
            // Could play a gentle sound here
            return 300 // Reset for next time
          }
          return prev - 1
        })
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning, timeRemaining])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!quote) return null

  const firstName = userName?.split(' ')[0] || 'back'

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/50 z-50 transition-opacity duration-300 ${
        isVisible && !isExiting ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      <div
        className={`relative bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-lg w-full mx-6 shadow-xl transform transition-all duration-500 ${
          isVisible && !isExiting
            ? 'scale-100 opacity-100'
            : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5 text-gray-500 dark:text-gray-400"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        {/* Welcome */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            Welcome {firstName}!
          </h2>
        </div>

        {/* Quote */}
        <div className="mb-6 px-4">
          <blockquote className="text-center">
            <p className="text-gray-700 dark:text-gray-300 italic mb-3">
              "{quote.text}"
            </p>
            <footer className="text-sm text-gray-600 dark:text-gray-400">
              — {quote.author}
              {quote.context && (
                <span className="block text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {quote.context}
                </span>
              )}
            </footer>
          </blockquote>
        </div>

        {/* Meditation Timer Section */}
        {showTimer && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-center">
            <div className="text-3xl font-light text-gray-800 dark:text-gray-200 mb-2">
              {formatTime(timeRemaining)}
            </div>
            {isRunning && (
              <div className="text-sm text-gray-600 dark:text-gray-400 animate-pulse">
                Breathe deeply and relax...
              </div>
            )}
          </div>
        )}

        {/* Meditation Button */}
        <button
          onClick={toggleMeditation}
          className={`w-full py-3 rounded-xl font-medium transition-all ${
            showTimer && isRunning
              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
              : showTimer
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {showTimer && isRunning
            ? 'Stop Meditation'
            : showTimer
            ? 'Resume Meditation'
            : '🧘 Start 5-min Meditation'}
        </button>

        {/* Help text */}
        <p className="text-center text-xs text-gray-500 dark:text-gray-500 mt-4">
          Press ESC or click outside to continue
        </p>
      </div>
    </div>
  )
}