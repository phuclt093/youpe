'use strict';

const {
  app, BrowserWindow, Menu, shell, dialog, ipcMain, nativeImage, globalShortcut,
  nativeTheme,
} = require('electron');
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


/* ---------------- tích hợp taskbar (Windows) ---------------- */

const ASSETS = path.join(__dirname, 'assets');
const image = (file) => nativeImage.createFromPath(path.join(ASSETS, `${file}.png`));

/**
 * Windows **không tô lại** icon của hàng nút thu nhỏ — nó vẽ đúng ảnh mình đưa.
 * Nền hàng nút đó sáng hay tối là theo chủ đề hệ thống, nên icon trắng đặt trên nền
 * sáng sẽ mất hút hoàn toàn. Vì vậy có sẵn hai bộ và chọn theo chủ đề đang dùng.
 */
const themed = (name) =>
  image(`${name}-${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}`);

/** Trạng thái phát gần nhất do giao diện web báo lên */
let playback = { playing: false, progress: 0, title: '' };

function send(cmd) {
  mainWindow?.webContents.send('youpe:command', cmd);
}

/**
 * Hàng nút hiện ra khi rê chuột lên icon taskbar.
 *
 * Windows chỉ cho tối đa 7 nút và **không cho đổi số lượng nút sau lần đặt đầu tiên**
 * trong một số bản — nên luôn đặt đúng ba nút, chỉ đổi ảnh của nút giữa.
 */
function updateThumbar() {
  if (!mainWindow || process.platform !== 'win32') return;

  mainWindow.setThumbarButtons([
    {
      tooltip: 'Lùi 10 giây',
      icon: themed('back'),
      click: () => send('back10'),
    },
    {
      tooltip: playback.playing ? 'Tạm dừng' : 'Phát',
      icon: themed(playback.playing ? 'pause' : 'play'),
      click: () => send('toggle'),
    },
    {
      tooltip: 'Tới 10 giây',
      icon: themed('forward'),
      click: () => send('forward10'),
    },
  ]);
}

function updateTaskbarState() {
  if (!mainWindow) return;

  // Thanh tiến trình chạy dọc theo icon. Giá trị âm là ẩn đi — dùng khi không xem gì,
  // vì để 0 thì Windows vẫn vẽ một vạch xám trông như đang treo.
  mainWindow.setProgressBar(playback.title ? playback.progress : -1);

  if (process.platform === 'win32') {
    if (playback.title) {
      mainWindow.setOverlayIcon(
        image(playback.playing ? 'badge-playing' : 'badge-paused'),
        playback.playing ? `Đang phát: ${playback.title}` : `Tạm dừng: ${playback.title}`
      );
    } else {
      mainWindow.setOverlayIcon(null, '');
    }
  }
}

/**
 * Jump List — menu hiện khi chuột phải vào icon trên taskbar.
 *
 * Mỗi mục là một lệnh khởi chạy lại chính file exe kèm tham số. Bản đang chạy nhận
 * tham số đó qua sự kiện `second-instance` rồi tự điều hướng, nên bấm vào không mở
 * thêm cửa sổ mới.
 */
function buildJumpList(payload) {
  if (process.platform !== 'win32') return;

  const task = (title, description, urlPath) => ({
    type: 'task',
    program: process.execPath,
    args: `--youpe-go=${encodeURIComponent(urlPath)}`,
    title,
    description,
    iconPath: process.execPath,
    iconIndex: 0,
  });

  const categories = [
    {
      type: 'custom',
      name: 'Điều hướng',
      items: [
        task('Trang chủ', 'Mở trang chủ youpe', '/'),
        task('Shorts', 'Xem video ngắn', '/shorts'),
        task('Kênh đăng ký', 'Video từ kênh bạn theo dõi', '/subscriptions'),
        task('Xem sau', 'Danh sách để dành', '/later'),
      ],
    },
  ];

  const push = (name, list) => {
    if (!list?.length) return;
    categories.push({
      type: 'custom',
      name,
      // Windows cắt bớt nếu quá dài, giữ 6 mục cho gọn mắt
      items: list.slice(0, 6).map((v) =>
        task(v.title, v.channel || 'youpe', `/watch?v=${v.id}`)
      ),
    });
  };

  push('Xem gần đây', payload?.recent);
  push('Gợi ý cho bạn', payload?.suggested);

  try {
    app.setJumpList(categories);
  } catch {
    // Windows từ chối khi người dùng đã tắt Jump List trong cài đặt hệ thống.
    // Không phải lỗi của app, bỏ qua.
  }
}

/** Bắt tham số --youpe-go=... từ Jump List và đưa cho giao diện web */
function handleArgs(argv) {
  const hit = (argv || []).find((a) => a.startsWith('--youpe-go='));
  if (!hit || !mainWindow) return;

  const target = decodeURIComponent(hit.slice('--youpe-go='.length));
  mainWindow.webContents.send('youpe:navigate', target);
}

/** Người dùng đổi chủ đề sáng/tối giữa chừng thì vẽ lại cho khỏi mất hút */
function watchTheme() {
  nativeTheme.on('updated', updateThumbar);
}

function registerIpc() {
  ipcMain.on('youpe:playback', (_e, state) => {
    const before = playback.playing;
    playback = { playing: false, progress: 0, title: '', ...state };

    updateTaskbarState();
    // vẽ lại hàng nút chỉ khi ảnh nút giữa thật sự đổi
    if (before !== playback.playing) updateThumbar();
  });

  ipcMain.on('youpe:jumplist', (_e, payload) => buildJumpList(payload));
}

/**
 * Phím media trên bàn phím, dùng được cả khi đang ở ứng dụng khác.
 * Không đăng ký được (phím đã bị app khác chiếm) thì bỏ qua, không báo lỗi.
 */
function registerMediaKeys() {
  const keys = {
    MediaPlayPause: 'toggle',
    MediaNextTrack: 'next',
    MediaPreviousTrack: 'prev',
  };
  for (const [key, cmd] of Object.entries(keys)) {
    try {
      globalShortcut.register(key, () => send(cmd));
    } catch {
      /* phím đang bị ứng dụng khác giữ */
    }
  }
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    updateThumbar();
    handleArgs(process.argv);
  });
  mainWindow.loadURL(serverUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    /*
      Cửa sổ nổi (Document Picture-in-Picture) cũng đi qua đúng đường này, với địa chỉ
      `about:blank`. Trước đây mọi thứ đều bị đẩy sang trình duyệt ngoài, nên bấm nút
      cửa sổ nổi lại ra hộp thoại "Get an app to open this 'about' link" của Windows —
      hệ điều hành không biết mở `about:` bằng gì.

      Chỉ những địa chỉ web thật mới nên mở ra ngoài. Còn lại để Chromium tự xử lý.
    */
    if (/^https?:/i.test(url)) shell.openExternal(url);

    /*
      Mọi thứ còn lại — chủ yếu là `about:blank` — đều từ chối, và **không** đẩy ra
      trình duyệt ngoài (Windows không biết mở `about:` bằng gì nên bật hộp thoại lạ).

      Cho phép cũng vô ích: Electron sẽ dựng một BrowserWindow trắng trơn, còn cửa sổ
      nổi kiểu Document PiP thì Electron chưa cài đặt (electron#39633) nên vẫn hỏng.
      Phía web đã tự nhận ra đang chạy trong app desktop và dùng đường khác.
    */
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (/^https?:/i.test(url) && !url.startsWith(serverUrl)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // tải lại trang thì hàng nút taskbar bị Windows xoá, phải đặt lại
  mainWindow.webContents.on('did-finish-load', updateThumbar);
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
  app.on('second-instance', (_e, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      handleArgs(argv);
    }
  });

  app.whenReady().then(async () => {
    try {
      serverUrl = await startServer();
      buildMenu();
      registerIpc();
      createWindow();
      buildJumpList(null);
      registerMediaKeys();
      watchTheme();
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
    globalShortcut.unregisterAll();
    stopServer();
  });

  app.on('will-quit', stopServer);
}
