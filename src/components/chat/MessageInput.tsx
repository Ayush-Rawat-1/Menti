import { useState, useRef, type KeyboardEvent } from 'react'
import { useChatStore } from '../../store/chatStore'

export default function MessageInput() {
  const [text, setText] = useState('')
  const { sendMessage, isStreaming } = useChatStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendMessage(trimmed)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const canSend = text.trim().length > 0 && !isStreaming

  return (
    <div className="px-6 py-4 border-t border-cream-200 bg-cream-50">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3 bg-white border border-cream-200 rounded-2xl px-4 py-3 shadow-soft focus-within:border-forest-500 focus-within:shadow-[0_0_0_3px_rgba(45,99,71,0.08)] transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="What's on your mind…"
            disabled={isStreaming}
            className="
              flex-1 resize-none bg-transparent outline-none
              font-sans text-sm text-stone-850 placeholder:text-bark-300
              leading-relaxed max-h-40 overflow-y-auto
              disabled:opacity-60
            "
            style={{ height: 'auto' }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`
              flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center
              transition-all duration-150
              ${canSend
                ? 'bg-forest-600 hover:bg-forest-700 shadow-soft cursor-pointer'
                : 'bg-cream-200 cursor-not-allowed'
              }
            `}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 12V2m0 0L3 6m4-4l4 4"
                stroke={canSend ? 'white' : '#B89880'}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <p className="text-center text-xs font-sans text-bark-300 mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
