/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['youtubei.js'],
  images: { unoptimized: true },
};
export default nextConfig;
