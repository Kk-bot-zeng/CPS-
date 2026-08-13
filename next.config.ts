import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/monitor-dashboard/:path*", destination: "http://127.0.0.1:8090/:path*" },
      { source: "/monitor-api/:path*", destination: "http://127.0.0.1:8090/api/:path*" },
    ];
  },
};

export default nextConfig;
