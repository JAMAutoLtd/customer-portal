/** @type {import('next').NextConfig} */
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
