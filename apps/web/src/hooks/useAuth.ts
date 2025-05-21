import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { useRouter, usePathname } from 'next/navigation'
import { UserProfile } from '@/types'
import { isPublicRoute } from '@/config/routes'
import { LOGIN_ROUTE } from '@/constants/routes'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLoggedOut, setIsLoggedOut] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoggedOut) {
      return
    }

    const checkSession = async () => {
      if (isPublicRoute(pathname)) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch('/api/auth/session')
        if (!response.ok) {
          console.log('Session not found')
        }

        const data = await response.json()

        setUser(data.user || null)
        setUserProfile(data.userProfile || null)

        if (data.user && !user) {
          router.refresh()
        }
      } catch (error) {
        console.error('Error checking session:', error)
        setUser(null)
        setUserProfile(null)
      } finally {
        setLoading(false)
      }
    }

    checkSession()
  }, [router, pathname, isLoggedOut])

  const login = async (email: string, password: string) => {
    try {
      setLoading(true)
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Login failed')
      }

      const { user, userProfile } = await response.json()

      setUser(user)
      setUserProfile(userProfile)

      return { success: true, data: { user, userProfile } }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      setIsLoggedOut(true)
      setLoading(true)

      setUser(null)
      setUserProfile(null)

      await fetch('/api/auth/logout', { method: 'POST' })

      router.push(LOGIN_ROUTE)

      return { success: true }
    } catch (error) {
      console.error('Logout failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      }
    }
  }

  return { user, userProfile, login, logout, loading }
}
