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
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ]
  },
}

export default nextConfig
