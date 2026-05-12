import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { useAuthStore } from '../../store/authStore'

export default function LoginPage() {
  const login = useAuthStore((s) => s.loginWithGoogle)

  const handleSuccess = async (res: CredentialResponse) => {
    if (!res.credential) return
    try {
      await login(res.credential)
    } catch {
      console.error('Login failed')
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-6">
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-forest-600/8 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-bark-200/50 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-md w-full">
        {/* Logo mark */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-forest-600 flex items-center justify-center shadow-soft-lg">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6z" fill="white" fillOpacity="0.2"/>
              <path d="M12 16.5C12 14.015 14.015 12 16.5 12S21 14.015 21 16.5 18.985 21 16.5 21 12 18.985 12 16.5z" fill="white"/>
              <path d="M10 11.5C10 10.672 10.672 10 11.5 10S13 10.672 13 11.5 12.328 13 11.5 13 10 12.328 10 11.5z" fill="white" fillOpacity="0.6"/>
            </svg>
          </div>
        </div>

        {/* Heading */}
        <div className="text-center mb-10">
          <h1 className="font-serif text-4xl text-stone-850 mb-3">
            Welcome to Mindful
          </h1>
          <p className="font-sans text-bark-400 text-lg leading-relaxed">
            A calm space to reflect, process,<br />and find clarity.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-soft-lg border border-cream-200">
          <p className="font-sans text-bark-400 text-sm text-center mb-6">
            Sign in securely to continue your journey
          </p>

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => console.error('Google login error')}
              useOneTap
              shape="pill"
              size="large"
              text="continue_with"
              theme="outline"
            />
          </div>

          <p className="mt-6 text-center text-xs font-sans text-bark-300 leading-relaxed">
            Your conversations are private and encrypted.
            <br />We never share your data.
          </p>
        </div>

        <p className="text-center mt-6 text-xs font-sans text-bark-300">
          By continuing you agree to our Terms & Privacy Policy
        </p>
      </div>
    </div>
  )
}
