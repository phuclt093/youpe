'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Cầu nối giữa giao diện web và vỏ Electron.
 *
 * Giao diện web chạy được độc lập trong trình duyệt, nên mọi thứ ở đây phải là
 * **tuỳ chọn thêm**: phía web luôn kiểm tra `window.youpeDesktop` có tồn tại không
 * trước khi gọi. Mở bằng Chrome thì chỉ là không có taskbar, mọi thứ khác vẫn đủ.
 */
contextBridge.exposeInMainWorld('youpeDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,

  /** Báo trạng thái phát để vẽ thanh tiến trình và huy hiệu trên icon taskbar */
  setPlayback: (state) => ipcRenderer.send('youpe:playback', state),

  /** Gửi danh sách video để dựng Jump List (chuột phải vào icon taskbar) */
  setJumpList: (payload) => ipcRenderer.send('youpe:jumplist', payload),

  /**
   * Nhận lệnh từ taskbar và phím media.
   * Trả về hàm để gỡ đăng ký — không gỡ thì mỗi lần render lại sẽ chồng thêm một tay nghe.
   */
  onCommand: (fn) => {
    const h = (_e, cmd) => fn(cmd);
    ipcRenderer.on('youpe:command', h);
    return () => ipcRenderer.removeListener('youpe:command', h);
  },

  /** Nhận yêu cầu mở video khi người dùng bấm một mục trong Jump List */
  onNavigate: (fn) => {
    const h = (_e, url) => fn(url);
    ipcRenderer.on('youpe:navigate', h);
    return () => ipcRenderer.removeListener('youpe:navigate', h);
  },
});
