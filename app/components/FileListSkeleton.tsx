'use client'

export function FileListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="relative bg-white rounded-lg border border-gray-200 shadow-sm animate-pulse"
        >
          {/* Thumbnail skeleton */}
          <div className="aspect-video bg-gray-200 rounded-t-lg" />

          {/* Content skeleton */}
          <div className="p-4 space-y-3">
            {/* Title */}
            <div className="h-4 bg-gray-200 rounded w-3/4" />

            {/* Metadata */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <div className="h-3 bg-gray-200 rounded w-1/4" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
              <div className="flex justify-between">
                <div className="h-6 bg-gray-200 rounded-full w-16" />
                <div className="h-3 bg-gray-200 rounded w-20" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <div className="h-8 bg-gray-200 rounded flex-1" />
              <div className="h-8 bg-gray-200 rounded w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}