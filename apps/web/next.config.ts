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
  experimental: {
    optimizePackageImports: ["recharts", "drizzle-orm"],
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
    }
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
