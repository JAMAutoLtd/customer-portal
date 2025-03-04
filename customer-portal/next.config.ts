import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // ✅ Correct placement inside nextConfig
  },
  redirects: async () => [
    {
      source: "/",
      destination: "/dashboard",
      permanent: true, // Use `true` if this redirect is permanent
    },
  ],
};

export default nextConfig;
