import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Fully client-side desktop OS: one static export (out/) is the product.
  output: "export",
};

export default nextConfig;
