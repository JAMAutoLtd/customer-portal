import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Not logged in, redirect to login
    redirect('/login')
  }

  // Get the user profile to check admin status
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  // Redirect based on admin status
  if (userData?.is_admin) {
    redirect('/dashboard/jobs')
  } else {
    redirect('/dashboard/orders')
  }
}
