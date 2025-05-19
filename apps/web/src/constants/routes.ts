export const LOGIN_ROUTE = '/login'
export const REGISTER_ROUTE = '/register'
export const PRIVATE_ROUTE = '/dashboard'
export const ORDERS_ROUTE = PRIVATE_ROUTE + '/orders'
export const JOBS_ROUTE = PRIVATE_ROUTE + '/jobs'
export const AVAILABILITY_ROUTE = PRIVATE_ROUTE + '/availability'
export const NEW_ORDER_ROUTE = PRIVATE_ROUTE + '/order/new'

export const PUBLIC_ROUTES = [
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  '/forgot-password',
  '/reset-password',
  '/api',
  '/_next',
  '/static',
  '/favicon.ico',
] as const
