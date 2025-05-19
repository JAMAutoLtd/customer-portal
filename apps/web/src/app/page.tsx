import { redirect } from 'next/navigation'
import { LOGIN_ROUTE } from '@/constants/routes'

export default async function Home() {
  redirect(LOGIN_ROUTE)
}
