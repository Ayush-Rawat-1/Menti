import { useState } from 'react'
import type { Thread } from '../../types'

interface Props {
  thread: Thread
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}

export default function ThreadItem({ thread, isActive, onSelect, onDelete }: Props) {
  const [showDelete, setShowDelete] = useState(false)

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    const hrs = Math.floor(diff / 3_600_000)
    const days = Math.floor(diff / 86_400_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (hrs < 24) return `${hrs}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      className={`
        group relative flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer
        transition-all duration-150
        ${isActive
          ? 'bg-forest-600 shadow-soft'
          : 'hover:bg-bark-100/60'
        }
      `}
      onClick={onSelect}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Active left accent */}
      {isActive && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-white/50 rounded-full" />
      )}

      {/* Icon */}
      <div className={`
        mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
        ${isActive ? 'bg-white/20' : 'bg-bark-100'}
      `}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M1 2.5A1.5 1.5 0 012.5 1h7A1.5 1.5 0 0111 2.5v5A1.5 1.5 0 019.5 9H7l-3 2.5V9H2.5A1.5 1.5 0 011 7.5v-5z"
            fill={isActive ? 'white' : '#B89880'}
          />
        </svg>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`
          text-sm font-sans font-medium truncate leading-snug
          ${isActive ? 'text-white' : 'text-bark-500'}
        `}>
          {thread.title}
        </p>
        <p className={`
          text-xs font-sans mt-0.5
          ${isActive ? 'text-white/60' : 'text-bark-300'}
        `}>
          {relativeTime(thread.updated_at)}
        </p>
      </div>

      {/* Delete button */}
      {showDelete && (
        <button
          className={`
            flex-shrink-0 p-1 rounded-lg transition-colors
            ${isActive ? 'hover:bg-white/20' : 'hover:bg-bark-200'}
          `}
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Delete conversation"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 5.5v4m4-4v4M1.5 3h11M6 1.5h2a.5.5 0 01.5.5v1h-3V2a.5.5 0 01.5-.5zM3 3l.7 8.2A.8.8 0 003.8 12h6.4a.8.8 0 00.8-.8L11 3H3z"
              stroke={isActive ? 'rgba(255,255,255,0.7)' : '#B89880'}
              strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  )
}
