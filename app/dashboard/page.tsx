'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { QuickOnboarding } from '@/app/components/QuickOnboarding'
import { MindfulMoment } from '@/app/components/MindfulMoment'
import { SmartFileUpload } from '@/app/components/upload'

export default function Dashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showMindfulMoment, setShowMindfulMoment] = useState(false)
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [alwaysShowMindful, setAlwaysShowMindful] = useState(false)

  useEffect(() => {
    // Check for onboarding parameter
    if (searchParams.get('onboarding') === 'true') {
      setShowOnboarding(true)
      const folderId = searchParams.get('folder')
      if (folderId) {
        setDriveFolderId(folderId)
      }
    }

    // Load localStorage preference after mounting
    const savedPreference = localStorage.getItem('alwaysShowMindful')
    if (savedPreference === 'true') {
      setAlwaysShowMindful(true)
    }
  }, [searchParams])

  useEffect(() => {
    // Fetch user's Drive folder ID from database
    const fetchUserData = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('drive_folder_id, created_at, email')
          .eq('id', user.id)
          .single()

        if (userData?.drive_folder_id) {
          setDriveFolderId(userData.drive_folder_id)
        }

        // Set user name from email
        if (userData?.email) {
          setUserName(userData.email.split('@')[0])
        }

        // Check if this is a returning user (not first login)
        // Show welcome back if: not onboarding, has folder, created more than 1 minute ago
        const isReturningUser = userData?.created_at &&
          new Date(userData.created_at).getTime() < Date.now() - 60000 && // Created more than 1 minute ago
          !searchParams.get('onboarding') &&
          userData.drive_folder_id

        // Check if we've already shown mindful moment this session
        const hasShownMindful = sessionStorage.getItem('mindfulShown')

        if (isReturningUser && !hasShownMindful) {
          // Always show if user opted in, otherwise 20% chance
          const shouldShowMindful = alwaysShowMindful || Math.random() < 0.2

          if (shouldShowMindful) {
            setShowMindfulMoment(true)
            sessionStorage.setItem('mindfulShown', 'true')
          }
        }
      }
    }

    fetchUserData()
  }, [searchParams, alwaysShowMindful])

  const toggleAlwaysShowMindful = () => {
    const newValue = !alwaysShowMindful
    setAlwaysShowMindful(newValue)
    localStorage.setItem('alwaysShowMindful', newValue.toString())
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {showOnboarding && (
        <QuickOnboarding
          driveFolderId={driveFolderId || undefined}
          onComplete={() => setShowOnboarding(false)}
        />
      )}
      {showMindfulMoment && (
        <MindfulMoment
          userName={userName}
          onComplete={() => setShowMindfulMoment(false)}
        />
      )}
      <div className="min-h-screen p-8">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-gray-800 dark:text-gray-100">
            Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <a
              href={driveFolderId ? `https://drive.google.com/drive/folders/${driveFolderId}` : "https://drive.google.com/drive/my-drive"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--accent)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent)'}
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M7.71 3.52L1.15 15l6.56 6.48L14.29 10l-6.58-6.48zm6.58 6.48l6.56 11.48L14.29 10zm.01 0L21 21.48 14.3 10z"/>
              </svg>
              Open Drive Folder
            </a>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 rounded-lg border transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              style={{ borderColor: 'var(--border)' }}
            >
              {isSigningOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </header>

      <main className="space-y-6">
        {/* Upload Section */}
        <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
          <h2 className="mb-4 text-xl font-semibold">Upload Media Files</h2>
          <SmartFileUpload onUploadComplete={() => window.location.reload()} />
        </div>

        {/* Dashboard Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
          <h2 className="mb-2 text-xl font-semibold">Overview</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Welcome to your dashboard. Here you can manage your media and content.
          </p>
        </div>

        <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
          <h2 className="mb-2 text-xl font-semibold">Recent Activity</h2>
          <p className="text-gray-600 dark:text-gray-400">
            No recent activity to display.
          </p>
        </div>

        <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
          <h2 className="mb-2 text-xl font-semibold">Quick Actions</h2>
          <div className="space-y-2">
            <button
              onClick={() => router.push('/files')}
              className="w-full px-4 py-2 text-left rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <span>📁</span> View All Files
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 text-left rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <span>🔄</span> Refresh Dashboard
            </button>
            <button className="w-full px-4 py-2 text-left rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 opacity-50 cursor-not-allowed" disabled>
              <span>⚙️</span> Settings (Coming Soon)
            </button>
          </div>
        </div>

        <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
          <h2 className="mb-2 text-xl font-semibold">Statistics</h2>
          <div className="space-y-2 text-gray-600 dark:text-gray-400">
            <p>Total Files: 0</p>
            <p>Storage Used: 0 MB</p>
            <p>Last Sync: Never</p>
          </div>
        </div>

        <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
          <h2 className="mb-2 text-xl font-semibold">Notifications</h2>
          <p className="text-gray-600 dark:text-gray-400">
            No new notifications.
          </p>
        </div>

        <div className="p-6 rounded-lg shadow-sm" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)', borderWidth: '1px', borderStyle: 'solid' }}>
          <h2 className="mb-2 text-xl font-semibold">Help & Support</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Need assistance? Check our documentation or contact support.
          </p>
        </div>
        </div>
      </main>

      <footer className="mt-12 pt-8 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Media Hub Dashboard
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
            📁 Files stored in your Drive · You own everything
          </p>
          {/* Subtle toggle for mindful moments */}
          <button
            onClick={toggleAlwaysShowMindful}
            className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
            title="Toggle daily mindful moments"
          >
            {alwaysShowMindful ? '🧘 Mindful moments: ON' : '🧘 Enable daily inspiration'}
          </button>
        </div>
      </footer>
      </div>
    </>
  );
}