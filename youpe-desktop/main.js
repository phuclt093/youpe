'use strict';

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');

/**
 * Vỏ desktop cho youpe.
 *
 * Việc chính: tự khởi động server Next ở nền rồi mở cửa sổ trỏ vào đó.
 * Người dùng không phải mở terminal, không phải nhớ lệnh, không thấy cửa sổ đen.
 *
 * Server vẫn là bản Next đầy đủ chứ không phải bản rút gọn — nghĩa là yt-dlp,
 * cache, tài khoản, mọi thứ chạy y hệt bản web.
 */

/**
 * Mặc định Chromium hãm mọi thứ khi cửa sổ bị ẩn hoặc che khuất — timer chạy chậm
 * lại và media bị tạm dừng. Với app xem video thì đó là hành vi sai, nên tắt đi.
 */
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const isDev = !!process.env.YOUPE_DEV_URL;
const RES = process.resourcesPath;

let serverProcess = null;
let mainWindow = null;
let serverUrl = process.env.YOUPE_DEV_URL || '';

/* ---------------- tiện ích ---------------- */

/** Xin hệ điều hành một cổng còn trống, tránh đụng cổng 3000 người dùng đang dùng */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await ping(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Chỗ để dữ liệu người dùng — không nằm trong thư mục cài đặt để nâng cấp không mất */
function userDataDir() {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ytdlpPath() {
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const bundled = path.join(RES, 'bin', name);
  return fs.existsSync(bundled) ? bundled : name; // không có bản gói kèm thì dùng PATH
}

/* ---------------- server ---------------- */

async function startServer() {
  if (isDev) {
    const url = process.env.YOUPE_DEV_URL;

    // Ở chế độ dev, vỏ này chỉ trỏ vào server Next đang chạy sẵn.
    // Chưa có server thì nói thẳng thay vì để cửa sổ trắng kèm ERR_CONNECTION_REFUSED.
    if (!(await waitForServer(url, 5000))) {
      throw new Error(
        `Không thấy server ở ${url}.\n\n` +
          'Dùng lệnh "npm run dev" trong thư mục youpe-desktop — nó tự khởi động ' +
          'youpe-web giúp bạn.\n\n' +
          'Hoặc mở terminal riêng: cd youpe-web && npm run dev'
      );
    }
    return url;
  }

  const serverDir = path.join(RES, 'server');
  const entry = path.join(serverDir, 'server.js');

  if (!fs.existsSync(entry)) {
    throw new Error(
      `Không tìm thấy server tại ${entry}.\n` +
        'Chạy "npm run prepare:web" trong thư mục youpe-desktop trước khi đóng gói.'
    );
  }

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;

  serverProcess = spawn(process.execPath, [entry], {
    cwd: serverDir,
    env: {
      ...process.env,
      // ELECTRON_RUN_AS_NODE để chạy file js bằng Node nhúng sẵn trong Electron,
      // nhờ vậy máy người dùng không cần cài Node
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      YOUPE_DATA_DIR: userDataDir(),
      YTDLP_PATH: ytdlpPath(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  serverProcess.on('exit', (code) => {
    if (code !== 0 && !app.isQuiting) {
      dialog.showErrorBox('youpe', `Server dừng đột ngột (mã ${code}).`);
    }
  });

  const ok = await waitForServer(url);
  if (!ok) throw new Error('Server không phản hồi sau 60 giây.');

  return url;
}

function stopServer() {
  if (!serverProcess) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t']);
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch {
    /* đang tắt máy rồi, không cần xử lý thêm */
  }
  serverProcess = null;
}

/* ---------------- cửa sổ ---------------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // cần cho việc phát media tự động
      autoplayPolicy: 'no-user-gesture-required',
      // giữ video chạy khi cửa sổ bị ẩn hoặc thu nhỏ
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(serverUrl);

  // link ra ngoài mở bằng trình duyệt mặc định, không nuốt vào cửa sổ app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(serverUrl)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'youpe',
      submenu: [
        {
          label: 'Trang chủ',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow?.loadURL(serverUrl),
        },
        {
          label: 'Tải lại',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        { type: 'separator' },
        {
          label: 'Mở thư mục dữ liệu',
          click: () => shell.openPath(userDataDir()),
        },
        {
          label: 'Công cụ nhà phát triển',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Thoát' },
      ],
    },
    {
      label: 'Hiển thị',
      submenu: [
        { role: 'togglefullscreen', label: 'Toàn màn hình' },
        { role: 'zoomIn', label: 'Phóng to' },
        { role: 'zoomOut', label: 'Thu nhỏ' },
        { role: 'resetZoom', label: 'Cỡ mặc định' },
      ],
    },
    {
      label: 'Sửa',
      submenu: [
        { role: 'cut', label: 'Cắt' },
        { role: 'copy', label: 'Sao chép' },
        { role: 'paste', label: 'Dán' },
        { role: 'selectAll', label: 'Chọn tất cả' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- vòng đời ---------------- */

// chỉ cho chạy một bản; mở lần nữa thì đưa cửa sổ cũ lên trước
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      serverUrl = await startServer();
      buildMenu();
      createWindow();
    } catch (e) {
      dialog.showErrorBox('Không khởi động được youpe', String(e?.message ?? e));
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    app.isQuiting = true;
    stopServer();
  });

  app.on('will-quit', stopServer);
}
