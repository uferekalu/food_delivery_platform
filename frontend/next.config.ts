import type { NextConfig } from "next";

const BACKEND_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  // Proxies browser-facing API calls through this app's own origin so the backend's refresh
  // cookie is first-party rather than third-party — see docs/ARCHITECTURE.md §11. Frontend and
  // backend are on different registrable domains in production; without this, browsers that
  // block third-party cookies (Safari always, Chrome/Edge in private modes) never store or send
  // the cookie at all, silently breaking session restore on a full reload.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
