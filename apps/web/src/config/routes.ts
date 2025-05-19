import { PUBLIC_ROUTES } from '@/constants/routes'

export const isPublicRoute = (pathname: string) => {
  return PUBLIC_ROUTES.some(
    (route) => pathname.startsWith(route) || pathname === '/',
  )
}
