import { apiClient } from './client'
import type { AuthResponse } from '../types'

export const loginWithGoogle = (credential: string) =>
  apiClient.post<AuthResponse>('/auth/google', { credential }).then((r) => r.data)

export const refreshToken = () =>
  apiClient
    .post<{ access_token: string }>('/auth/refresh', {}, { withCredentials: true })
    .then((r) => r.data.access_token)

export const logout = () =>
  apiClient.post('/auth/logout', {}, { withCredentials: true })
