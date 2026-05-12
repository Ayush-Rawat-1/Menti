import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Token storage ───────────────────────────────────────────────────────────

let _accessToken: string | null = null

export const setAccessToken = (token: string | null) => {
  _accessToken = token
}

export const getAccessToken = () => _accessToken

// ─── Request interceptor — attach Bearer token ───────────────────────────────

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (_accessToken && config.headers) {
    config.headers['Authorization'] = `Bearer ${_accessToken}`
  }
  return config
})

// ─── Response interceptor — silent refresh on 401 ────────────────────────────

let _refreshPromise: Promise<string> | null = null

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Never retry auth routes — avoids infinite loop when refresh itself 401s
    const isAuthRoute = original.url?.startsWith('/auth/')
    if (error.response?.status === 401 && !original._retry && !isAuthRoute) {
      original._retry = true

      try {
        // Deduplicate parallel refresh calls
        if (!_refreshPromise) {
          _refreshPromise = apiClient
            .post<{ access_token: string }>('/auth/refresh', {}, { withCredentials: true })
            .then((r) => r.data.access_token)
            .finally(() => { _refreshPromise = null })
        }

        const newToken = await _refreshPromise
        setAccessToken(newToken)

        if (original.headers) {
          original.headers['Authorization'] = `Bearer ${newToken}`
        }

        return apiClient(original)
      } catch {
        setAccessToken(null)
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export const API_BASE = BASE_URL
