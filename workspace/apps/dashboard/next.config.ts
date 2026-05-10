/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@remaju/shared', '@remaju/api', '@remaju/database'],
  output: 'standalone',
  typescript: {
    // Type checking is done by `pnpm type-check` — Next.js build skips it
    // to avoid false positives from tRPC v11's hashed internal type files
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
