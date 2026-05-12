import { apiClient } from './client'
import type { Thread, CreateThreadResponse } from '../types'

export const getThreads = () =>
  apiClient.get<Thread[]>('/threads').then((r) => r.data)

export const createThread = () =>
  apiClient.post<CreateThreadResponse>('/threads').then((r) => r.data)

export const deleteThread = (threadId: string) =>
  apiClient.delete(`/threads/${threadId}`)
