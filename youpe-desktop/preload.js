'use strict';

const { contextBridge } = require('electron');

/**
 * Hiện tại giao diện web không cần gọi gì từ Electron, nên chỉ để lộ một cờ
 * để phía web biết đang chạy trong app desktop (dùng cho việc ẩn/hiện vài chi tiết).
 */
contextBridge.exposeInMainWorld('youpeDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
});
