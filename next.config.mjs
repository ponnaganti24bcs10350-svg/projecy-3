/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack config (Next.js 16+)
  turbopack: {},

  // Run @xenova/transformers natively in Node.js — don't bundle it
  serverExternalPackages: ["@xenova/transformers"],

  // Increase serverless function body size limit for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
