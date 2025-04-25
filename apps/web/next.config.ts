/** @type {import('next').NextConfig} */
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/orders',
        permanent: true, // ✅ Use `true` if this redirect is permanent
      },
    ]
  },
}

export default nextConfig
