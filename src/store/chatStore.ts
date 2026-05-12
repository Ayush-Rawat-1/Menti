import { create } from 'zustand'
import { getThreads, createThread, deleteThread, getThread } from '../api/threads'
import { getMessages, streamMessage } from '../api/messages'
import type { Thread, Message } from '../types'

interface ChatStore {
  threads: Thread[]
  activeThreadId: string | null
  messages: Record<string, Message[]>
  streamingContent: string
  isStreaming: boolean
  streamingThreadId: string | null
  isLoadingThreads: boolean
  isLoadingMessages: boolean

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
  streamingThreadId: null,
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
    if (get().messages[threadId]) return

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
    set({ activeThreadId: null })
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

    let currentThreadId = get().activeThreadId

    // 1. Create the thread using backend time if it doesn't exist
    if (!currentThreadId) {
      const { thread_id, updated_at } = await createThread()
      
      const formattedTitle = new Date(updated_at).toLocaleString('en-US', { 
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
      })
      
      set((s) => ({
        threads: [
          { 
            thread_id, 
            title: formattedTitle, 
            created_at: updated_at, 
            updated_at: updated_at 
          },
          ...s.threads,
        ],
        activeThreadId: thread_id,
        messages: { ...s.messages, [thread_id]: [] },
      }))
      
      currentThreadId = thread_id
    }

    const activeThreadId = currentThreadId

    // ADD THIS LINE HERE:
    // This proves to TypeScript that activeThreadId is definitely a string
    if (!activeThreadId) return

    // ... the rest of the function remains exactly the same
    const userMsg: Message = { role: 'user', content }
    
    set((s) => {
      // Find where the thread currently sits in the list
      const threadIndex = s.threads.findIndex(t => t.thread_id === activeThreadId)
      let newThreads = [...s.threads]

      if (threadIndex !== -1) {
        // Remove it from its current position
        const [activeThread] = newThreads.splice(threadIndex, 1)
        const optimisticNow = new Date()

        // Place it at the very top (index 0) with a temporary optimistic timestamp
        newThreads.unshift({
          ...activeThread,
          updated_at: optimisticNow.toISOString(),
          title: optimisticNow.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        })
      }

      return {
        messages: {
          ...s.messages,
          [activeThreadId]: [...(s.messages[activeThreadId] ?? []), userMsg],
        },
        threads: newThreads, // Apply the reordered array
        isStreaming: true,
        streamingContent: '',
        streamingThreadId: activeThreadId,
      }
    })

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
            streamingThreadId: null,
          }))

          // Fetch the exact backend timestamp to replace our optimistic one
          getThread(activeThreadId).then((threadData) => {
            set((s) => ({
              threads: s.threads.map((t) => {
                if (t.thread_id === activeThreadId) {
                  return {
                    ...t,
                    updated_at: threadData.updated_at,
                    title: new Date(threadData.updated_at).toLocaleString('en-US', { 
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
                    })
                  }
                }
                return t
              })
            }))
          }).catch(() => {})

          resolve()
        },
        (_err) => {
          set({ isStreaming: false, streamingContent: '', streamingThreadId: null })
          resolve()
        }
      )
    })

    void abortStream
  },
}))