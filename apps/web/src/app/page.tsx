import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    // Not logged in, redirect to login
    redirect('/login')
  }

  // Get the user profile to check admin status
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', session.user.id)
    .single()

  // Redirect based on admin status
  if (userData?.is_admin) {
    redirect('/jobs')
  } else {
    redirect('/orders')
  }
}
