/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: true, // ✅ Use `true` if this redirect is permanent
      },
    ];
  },
};

export default nextConfig;
