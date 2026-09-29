import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:4001";
const distDir = process.env.NEXT_DIST_DIR ?? ".next";
const devProxyOrigin = process.env.DEV_PROXY_ORIGIN?.replace(/\/$/, "");
const devProxyBasePath = process.env.DEV_PROXY_BASE_PATH ?? "/cashledger/dev";
const standalone = process.env.CASHLEDGER_STANDALONE === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  basePath,
  distDir,
  ...(standalone
    ? { output: "standalone" as const, outputFileTracingRoot: repoRoot }
    : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    const apiRewrite = {
      source: "/api/:path*",
      destination: apiOrigin + "/api/:path*",
    };
    if (!devProxyOrigin) return [apiRewrite];
    return {
      beforeFiles: [
        {
          source: "/dev",
          destination: devProxyOrigin + devProxyBasePath,
        },
        {
          source: "/dev/:path*",
          destination: devProxyOrigin + devProxyBasePath + "/:path*",
        },
      ],
      afterFiles: [apiRewrite],
      fallback: [],
    };
  },
};

export default nextConfig;
