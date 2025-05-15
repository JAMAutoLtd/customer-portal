export const publicRoutes = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/api',
  '/_next',
  '/static',
  '/favicon.ico',
] as const

export const isPublicRoute = (pathname: string) => {
  return publicRoutes.some(
    (route) => pathname.startsWith(route) || pathname === '/',
  )
}
