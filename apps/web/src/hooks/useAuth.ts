import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase/client'
import { User } from '@supabase/supabase-js'
import { useRouter, usePathname } from 'next/navigation'
import { UserProfile } from '@/types'
import { isPublicRoute } from '@/config/routes'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const checkSession = async () => {
      if (isPublicRoute(pathname)) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch('/api/auth/session')
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

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      await checkSession()

      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        router.refresh()
      }
    })

    checkSession()

    return () => {
      subscription.unsubscribe()
    }
  }, [router, pathname])

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

      const data = await response.json()

      // Update state with the login response data
      setUser(data.user)
      setUserProfile(data.userProfile)

      return { success: true, data }
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
      setLoading(true)

      await fetch('/api/auth/logout', { method: 'POST' })

      setUser(null)
      setUserProfile(null)
      router.push('/login')
      return { success: true }
    } catch (error) {
      console.error('Logout failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      }
    } finally {
      setLoading(false)
    }
  }

  return { user, userProfile, login, logout, loading }
}
