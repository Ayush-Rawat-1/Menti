import type { Message } from '../../types'

interface Props {
  message: Message
  isStreaming?: boolean
}

export default function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex items-end gap-3 animate-slide-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center mb-0.5 shadow-sm">
          <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
            <path d="M12 16.5C12 14.015 14.015 12 16.5 12S21 14.015 21 16.5 18.985 21 16.5 21 12 18.985 12 16.5z" fill="white"/>
          </svg>
        </div>
      )}

      <div className={`max-w-[72%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`
            px-4 py-3 rounded-2xl font-sans text-sm leading-relaxed shadow-sm
            ${isUser
              ? 'bg-green-600 text-white rounded-br-sm'
              : 'bg-white border border-cream-200 text-stone-850 rounded-bl-sm'
            }
            ${isStreaming ? 'min-w-[2rem]' : ''}
          `}
        >
          {message.content}
          {isStreaming && (
            <span className="inline-flex items-center gap-0.5 ml-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className={`w-1 h-1 rounded-full ${isUser ? 'bg-white' : 'bg-green-600'} opacity-60 animate-pulse-dot`}
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}