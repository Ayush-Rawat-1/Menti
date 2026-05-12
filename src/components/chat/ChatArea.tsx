import { useChatStore } from '../../store/chatStore'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import EmptyState from './EmptyState'

export default function ChatArea() {
  const { activeThreadId, threads } = useChatStore()

  const activeThread = threads.find((t) => t.thread_id === activeThreadId)

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden bg-cream-100">
      {/* Header */}
      {activeThreadId && (
        <header className="flex-shrink-0 px-6 py-4 border-b border-cream-200 bg-cream-50 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-forest-500" />
          <h2 className="font-serif text-base text-stone-850 truncate">
            {activeThread?.title ?? 'Conversation'}
          </h2>
        </header>
      )}

      {/* Body */}
      {activeThreadId ? (
        <>
          <MessageList />
          <MessageInput />
        </>
      ) : (
        <>
          <EmptyState />
          <MessageInput />
        </>
      )}
    </main>
  )
}
