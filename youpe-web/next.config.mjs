/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bản standalone gồm server.js kèm đúng module cần thiết — app desktop dùng bản này
  output: 'standalone',
  serverExternalPackages: ['youtubei.js'],
  // node:sqlite là module nội bộ của Node, không được bundle
  webpack: (config, { dev }) => {
    config.externals = [...(config.externals ?? []), { 'node:sqlite': 'commonjs node:sqlite' }];

    /**
     * Bớt thứ phải theo dõi khi chạy dev.
     *
     * Mỗi thư mục tốn một watcher của inotify, mà Linux mặc định chỉ cho khoảng
     * 8192 cái cho cả máy — dùng chung với trình soạn thảo, trình duyệt, và mọi
     * thứ khác đang mở. Riêng youpe-web đã có hơn 1300 thư mục, 1239 trong số đó
     * nằm ở node_modules và chẳng bao giờ đổi giữa chừng.
     *
     * Chạm trần thì Watchpack nôn ra hàng trăm dòng `ENOSPC` và nạp lại nóng
     * ngừng hoạt động, dù app vẫn chạy — kiểu hỏng khó đoán ra nhất.
     */
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.next/**',
          '**/.git/**',
          '**/data/**',
          '**/bin/**',
          '**/release/**',
          '**/resources/**',
        ],
        aggregateTimeout: 300,
      };
    }

    return config;
  },
  images: { unoptimized: true },
};
export default nextConfig;
