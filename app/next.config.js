/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Increase static worker timeout from 60s to 3 minutes
    // Needed for large apps with many pages on resource-constrained machines
    workerThreads: false,
    cpus: 2,
  },
}

module.exports = nextConfig
