// ─── Auth ───────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  picture?: string
}

export interface AuthState {
  user: User | null
  accessToken: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

// ─── Threads ─────────────────────────────────────────────────────────────────

export interface Thread {
  thread_id: string
  title: string
  created_at: string
  updated_at: string
}

// ─── Messages ────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant'

export interface Message {
  role: MessageRole
  content: string
}

export interface SSEToken {
  type: 'token' | 'done'
  content: string
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string
  user: User
}

export interface CreateThreadResponse {
  thread_id: string
}
