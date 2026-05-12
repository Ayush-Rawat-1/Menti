import { useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import ThreadItem from './ThreadItem'

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const { threads, activeThreadId, isLoadingThreads, loadThreads, selectThread, startNewThread, removeThread } = useChatStore()

  useEffect(() => { loadThreads() }, [loadThreads])

  return (
    <aside className="w-72 flex-shrink-0 h-screen flex flex-col bg-cream-50 border-r border-cream-200">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 border-b border-cream-200">
        <div className="w-8 h-8 rounded-lg bg-forest-600 flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
            <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6z" fill="white" fillOpacity="0.25"/>
            <path d="M12 16.5C12 14.015 14.015 12 16.5 12S21 14.015 21 16.5 18.985 21 16.5 21 12 18.985 12 16.5z" fill="white"/>
          </svg>
        </div>
        <span className="font-serif text-stone-850 text-lg font-medium">Mindful</span>
      </div>

      {/* New chat button */}
      <div className="px-3 py-3">
        <button
          onClick={startNewThread}
          className="
            w-full flex items-center gap-2 px-4 py-2.5 rounded-xl
            bg-forest-600 hover:bg-forest-700 active:bg-forest-800
            text-white font-sans text-sm font-medium
            transition-colors duration-150 shadow-soft
          "
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          New conversation
        </button>
      </div>

      {/* Thread list */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {isLoadingThreads ? (
          <div className="space-y-2 px-1 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-gradient-to-r from-cream-200 via-cream-100 to-cream-200 bg-[length:200%_100%] animate-shimmer" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="font-sans text-bark-300 text-sm">No conversations yet</p>
            <p className="font-sans text-bark-300 text-xs mt-1">Start a new one above</p>
          </div>
        ) : (
          <>
            <p className="px-3 pt-2 pb-1 text-xs font-sans font-medium text-bark-300 uppercase tracking-wider">
              Recents
            </p>
            {threads.map((thread) => (
              <ThreadItem
                key={thread.thread_id}
                thread={thread}
                isActive={thread.thread_id === activeThreadId}
                onSelect={() => selectThread(thread.thread_id)}
                onDelete={() => removeThread(thread.thread_id)}
              />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      {user && (
        <div className="px-3 py-3 border-t border-cream-200 flex items-center gap-3">
          {user.picture ? (
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-bark-200 flex items-center justify-center flex-shrink-0">
              <span className="font-sans text-bark-500 text-sm font-medium">
                {user.name?.[0]?.toUpperCase()}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-sans text-sm font-medium text-stone-850 truncate">{user.name}</p>
            <p className="font-sans text-xs text-bark-300 truncate">{user.email}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-bark-100 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10.5 5.5L13 8l-2.5 2.5M13 8H6M6 3H3.5A1.5 1.5 0 002 4.5v7A1.5 1.5 0 003.5 13H6"
                stroke="#B89880" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </aside>
  )
}
