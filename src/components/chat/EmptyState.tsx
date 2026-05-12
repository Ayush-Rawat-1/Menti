import { useChatStore } from '../../store/chatStore'

const prompts = [
  "I've been feeling overwhelmed lately…",
  "Something happened today I need to process.",
  "I want to talk about my anxiety.",
  "Help me understand why I'm feeling this way.",
]

export default function EmptyState() {
  const { startNewThread, sendMessage, activeThreadId } = useChatStore()

  const handlePrompt = async (p: string) => {
    if (!activeThreadId) await startNewThread()
    await sendMessage(p)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center">
      {/* Decorative ring */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full bg-forest-600/10 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-forest-600/20 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-forest-600 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <path d="M12 16.5C12 14.015 14.015 12 16.5 12S21 14.015 21 16.5 18.985 21 16.5 21 12 18.985 12 16.5z" fill="white"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <h2 className="font-serif text-2xl text-stone-850 mb-3">
        How are you feeling today?
      </h2>
      <p className="font-sans text-bark-400 text-base leading-relaxed max-w-xs mb-10">
        This is your private space. Share whatever is on your mind — there's no judgment here.
      </p>

      {/* Prompt suggestions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {prompts.map((p) => (
          <button
            key={p}
            onClick={() => void handlePrompt(p)}
            className="
              text-left px-4 py-3 rounded-xl border border-cream-200 bg-white
              hover:border-forest-500/40 hover:bg-forest-600/5
              font-sans text-sm text-bark-500 leading-snug
              transition-all duration-150 shadow-soft hover:shadow-soft-lg
            "
          >
            "{p}"
          </button>
        ))}
      </div>
    </div>
  )
}
