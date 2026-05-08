import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receipts (photos, PDFs) and project photos are uploaded via server
      // actions. The Next default is 1MB which silently rejects most phone
      // photos as "A server error occurred." before our code runs. The
      // receipt action enforces its own 12MB limit; this just lifts the
      // platform ceiling above it.
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
