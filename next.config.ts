import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Phase 4A: the app is a server build — the /api/proxy route (the
  // Browser app's same-origin page proxy) must run in production.
  // The single page itself still prerenders statically.
};

export default nextConfig;
