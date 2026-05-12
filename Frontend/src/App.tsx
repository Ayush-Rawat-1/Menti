import { useEffect } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { useAuthStore } from './store/authStore'
import LoginPage from './components/auth/LoginPage'
import Sidebar from './components/sidebar/Sidebar'
import ChatArea from './components/chat/ChatArea'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

function AppInner() {
  const { isAuthenticated, isLoading, tryRefresh } = useAuthStore()

  // On mount, attempt silent token refresh (restores session from HttpOnly cookie)
  useEffect(() => { void tryRefresh() }, [tryRefresh])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-bark-300 font-sans text-sm">
          <div className="flex gap-1">
            {[0, 150, 300].map((d) => (
              <span key={d} className="w-2 h-2 rounded-full bg-bark-300 animate-pulse-dot" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <ChatArea />
    </div>
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppInner />
    </GoogleOAuthProvider>
  )
}
