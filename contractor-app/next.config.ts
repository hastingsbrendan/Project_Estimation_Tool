import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receipts (photos, PDFs) and project photos are uploaded via server
      // actions. The Next default is 1MB which silently rejects most phone
      // photos as "A server error occurred." before our code runs (digest
      // 3062837146). Modern phone photos are 4-15MB; iPhone 15 Pro 48MP can
      // exceed 20MB. The receipt action also compresses images client-side
      // before sending — this is the platform ceiling for anything that
      // slips through (PDFs, HEIC files, etc.).
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
