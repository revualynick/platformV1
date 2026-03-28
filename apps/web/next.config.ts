import type { NextConfig } from "next";

// NOTE: rewrites() is evaluated at build time, so INTERNAL_API_URL gets baked
// into the output. This only affects browser-side requests routed through the
// Next.js proxy. All server-side API calls (lib/api.ts) read the env var at
// runtime and are unaffected. Since we have no client-side /api/v1/ fetches
// (everything goes through server actions), this is safe.
const API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "standalone",
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
