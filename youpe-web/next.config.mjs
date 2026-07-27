/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bản standalone gồm server.js kèm đúng module cần thiết — app desktop dùng bản này
  output: 'standalone',
  serverExternalPackages: ['youtubei.js'],
  // node:sqlite là module nội bộ của Node, không được bundle
  webpack: (config) => {
    config.externals = [...(config.externals ?? []), { 'node:sqlite': 'commonjs node:sqlite' }];
    return config;
  },
  images: { unoptimized: true },
};
export default nextConfig;
