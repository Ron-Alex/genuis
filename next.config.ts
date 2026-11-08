import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["esbuild"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
