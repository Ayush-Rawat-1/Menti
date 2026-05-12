import { useEffect, useRef } from 'react'
import { useChatStore } from '../../store/chatStore'
import MessageBubble from './MessageBubble'

export default function MessageList() {
  const { 
    activeThreadId, 
    messages, 
    streamingContent, 
    isStreaming, 
    isLoadingMessages,
    streamingThreadId // <-- Destructure the new state
  } = useChatStore()
  
  const bottomRef = useRef<HTMLDivElement>(null)

  const threadMessages = activeThreadId ? (messages[activeThreadId] ?? []) : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMessages.length, streamingContent])

  if (isLoadingMessages) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-bark-300 font-sans text-sm">
          <div className="flex gap-1">
            {[0, 150, 300].map((d) => (
              <span key={d} className="w-2 h-2 rounded-full bg-bark-300 animate-pulse-dot" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
          Loading messages
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
      {threadMessages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}

      {/* Streaming assistant message - only show if THIS thread is the one streaming */}
      {isStreaming && streamingContent && activeThreadId === streamingThreadId && (
        <MessageBubble
          message={{ role: 'assistant', content: streamingContent }}
          isStreaming
        />
      )}

      {/* Typing indicator before first token - only show if THIS thread is the one streaming */}
      {isStreaming && !streamingContent && activeThreadId === streamingThreadId && (
        <div className="flex items-end gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-forest-600 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
              <path d="M12 16.5C12 14.015 14.015 12 16.5 12S21 14.015 21 16.5 18.985 21 16.5 21 12 18.985 12 16.5z" fill="white"/>
            </svg>
          </div>
          <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-cream-200 shadow-soft flex gap-1 items-center">
            {[0, 150, 300].map((d) => (
              <span key={d} className="w-2 h-2 rounded-full bg-bark-300 animate-pulse-dot" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}