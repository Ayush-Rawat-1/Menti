import { create } from 'zustand'
import { setAccessToken } from '../api/client'
import { loginWithGoogle, refreshToken, logout as apiLogout } from '../api/auth'
import type { User } from '../types'

interface AuthStore {
  user: User | null
  accessToken: string | null
  isLoading: boolean
  isAuthenticated: boolean

  // Actions
  loginWithGoogle: (credential: string) => Promise<void>
  tryRefresh: () => Promise<boolean>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true,
  isAuthenticated: false,

  loginWithGoogle: async (credential) => {
    const data = await loginWithGoogle(credential)
    setAccessToken(data.access_token)
    set({ user: data.user, accessToken: data.access_token, isAuthenticated: true })
  },

  tryRefresh: async () => {
    try {
      const token = await refreshToken()
      setAccessToken(token)
      set({ accessToken: token, isAuthenticated: true, isLoading: false })
      return true
    } catch {
      setAccessToken(null)
      set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
      return false
    } finally {
      // Safety net — isLoading must always clear regardless of what happens above
      set((s) => s.isLoading ? { isLoading: false } : {})
    }
  },

  logout: async () => {
    try { await apiLogout() } catch { /* best-effort */ }
    setAccessToken(null)
    set({ user: null, accessToken: null, isAuthenticated: false })
  },
}))
