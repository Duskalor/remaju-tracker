/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@remaju/shared'],
  output: 'standalone',
};

module.exports = nextConfig;
