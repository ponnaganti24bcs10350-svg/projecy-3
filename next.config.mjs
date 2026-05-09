/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack config (Next.js 16+) — silence the turbopack warning
  turbopack: {},

  // Increase serverless function body size limit for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
