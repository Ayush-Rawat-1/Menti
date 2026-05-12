import { apiClient } from './client'
import type { Thread } from '../types'

export const getThreads = () =>
  apiClient.get<any[]>('/threads').then((r) => 
    r.data.map(t => {
      const formattedDate = new Date(t.updated_at).toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit' 
      })

      return {
        ...t,
        thread_id: t.id,
        title: formattedDate
      }
    }) as Thread[]
  )

export const createThread = () =>
  apiClient.post<any>('/threads').then((r) => ({
    thread_id: r.data.id,
    updated_at: r.data.updated_at // Capture the exact backend creation time
  }))

// Add this to fetch the latest timestamp after a message stream
export const getThread = (threadId: string) =>
  apiClient.get<any>(`/threads/${threadId}`).then((r) => r.data)

export const deleteThread = (threadId: string) =>
  apiClient.delete(`/threads/${threadId}`)