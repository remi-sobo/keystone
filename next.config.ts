import type { NextConfig } from "next";

// The retired deployment hostname lives here and nowhere else in shipped
// code (the config-integrity gate walks src/ only). Requests that still
// arrive at the vercel.app alias get a permanent redirect to the real
// domain, path and query preserved. The target reads NEXT_PUBLIC_APP_URL
// (set in vercel.json) with the same fallback src/lib/env.ts declares,
// so a domain change stays a config-level edit.
const VERCEL_ALIAS_HOST = "keystone-blue-tau.vercel.app";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://app.soboconsulting.com";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: VERCEL_ALIAS_HOST }],
        destination: `${APP_URL}/:path*`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
