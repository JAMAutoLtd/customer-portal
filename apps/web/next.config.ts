/** @type {import('next').NextConfig} */
// Restore dotenv import and usage
import path from 'path'
import dotenv from 'dotenv'

// Restore dotenv.config
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const nextConfig = {
  output: 'standalone',
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
