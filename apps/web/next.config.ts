import type { NextConfig } from "next";

const API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  transpilePackages: ["@revualy/shared"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_URL}/api/v1/:path*`,
      },
      {
        source: "/webhooks/:path*",
        destination: `${API_URL}/webhooks/:path*`,
      },
    ];
  },
};

export default nextConfig;
