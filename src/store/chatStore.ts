import { create } from 'zustand'
import { getThreads, createThread, deleteThread } from '../api/threads'
import { getMessages, streamMessage } from '../api/messages'
import type { Thread, Message } from '../types'

interface ChatStore {
  threads: Thread[]
  activeThreadId: string | null
  messages: Record<string, Message[]>   // threadId → messages
  streamingContent: string              // partial AI response being typed
  isStreaming: boolean
  isLoadingThreads: boolean
  isLoadingMessages: boolean

  // Actions
  loadThreads: () => Promise<void>
  selectThread: (threadId: string) => Promise<void>
  startNewThread: () => Promise<void>
  removeThread: (threadId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
}

export const useChatStore = create<ChatStore>((set, get) => ({
  threads: [],
  activeThreadId: null,
  messages: {},
  streamingContent: '',
  isStreaming: false,
  isLoadingThreads: false,
  isLoadingMessages: false,

  loadThreads: async () => {
    set({ isLoadingThreads: true })
    try {
      const threads = await getThreads()
      set({ threads, isLoadingThreads: false })
    } catch {
      set({ isLoadingThreads: false })
    }
  },

  selectThread: async (threadId) => {
    set({ activeThreadId: threadId })
    if (get().messages[threadId]) return        // already cached

    set({ isLoadingMessages: true })
    try {
      const msgs = await getMessages(threadId)
      set((s) => ({
        messages: { ...s.messages, [threadId]: msgs },
        isLoadingMessages: false,
      }))
    } catch {
      set({ isLoadingMessages: false })
    }
  },

  startNewThread: async () => {
    const { thread_id } = await createThread()
    set((s) => ({
      threads: [
        { thread_id, title: 'New conversation', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ...s.threads,
      ],
      activeThreadId: thread_id,
      messages: { ...s.messages, [thread_id]: [] },
    }))
  },

  removeThread: async (threadId) => {
    await deleteThread(threadId)
    set((s) => {
      const threads = s.threads.filter((t) => t.thread_id !== threadId)
      const messages = { ...s.messages }
      delete messages[threadId]
      const activeThreadId = s.activeThreadId === threadId ? (threads[0]?.thread_id ?? null) : s.activeThreadId
      return { threads, messages, activeThreadId }
    })
  },

  sendMessage: async (content) => {
    if (!content.trim()) return

    // Auto-create a thread if none is active (user typed directly into input)
    if (!get().activeThreadId) {
      await get().startNewThread()
    }

    const activeThreadId = get().activeThreadId
    if (!activeThreadId) return

    // Append user message immediately
    const userMsg: Message = { role: 'user', content }
    set((s) => ({
      messages: {
        ...s.messages,
        [activeThreadId]: [...(s.messages[activeThreadId] ?? []), userMsg],
      },
      isStreaming: true,
      streamingContent: '',
    }))

    // Update thread's updated_at in sidebar
    set((s) => ({
      threads: s.threads.map((t) =>
        t.thread_id === activeThreadId ? { ...t, updated_at: new Date().toISOString() } : t
      ),
    }))

    let abortStream: (() => void) | null = null

    await new Promise<void>((resolve) => {
      abortStream = streamMessage(
        activeThreadId,
        content,
        (token) => set((s) => ({ streamingContent: s.streamingContent + token })),
        () => {
          // Commit streamed content as assistant message
          const final = get().streamingContent
          set((s) => ({
            messages: {
              ...s.messages,
              [activeThreadId]: [
                ...(s.messages[activeThreadId] ?? []),
                { role: 'assistant', content: final },
              ],
            },
            streamingContent: '',
            isStreaming: false,
          }))
          resolve()
        },
        (_err) => {
          set({ isStreaming: false, streamingContent: '' })
          resolve()
        }
      )
    })

    void abortStream
  },
}))
