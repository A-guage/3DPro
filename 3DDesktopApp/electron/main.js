const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');

// ==================== 配置 ====================
const IS_DEV = !app.isPackaged;
const APP_ROOT = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');

const SERVICES = {
  Backend: {
    port: 8000,
    command: path.join(APP_ROOT, 'backend', 'venv', 'Scripts', 'python.exe'),
    args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
    cwd: path.join(APP_ROOT, 'backend'),
    envFile: path.join(APP_ROOT, 'backend', '.env'),
    checkPath: '/docs',
    startTimeout: 15000,
  },
  Agent: {
    port: 3001,
    command: IS_DEV ? 'node' : process.execPath,
    args: [path.join(APP_ROOT, 'backend', 'agent_service', 'index.mjs')],
    cwd: path.join(APP_ROOT, 'backend', 'agent_service'),
    envFile: path.join(APP_ROOT, 'backend', 'agent_service', '.env'),
    checkPath: '/health',
    startTimeout: 15000,
  },
};

const FRONTEND_DEV_URL = 'http://localhost:5173';
const FRONTEND_INDEX = path.join(APP_ROOT, 'frontend', 'dist', 'index.html');

// ==================== 状态 ====================
let mainWindow = null;
let tray = null;
const procs = {};

// ==================== 工具 ====================
function log(tag, msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] [${tag}] ${msg}`);
}

function loadEnvFile(filePath) {
  const env = { ...process.env };
  if (fs.existsSync(filePath)) {
    fs.readFileSync(filePath, 'utf-8').split('\n').forEach(line => {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const i = t.indexOf('=');
        if (i > 0) env[t.substring(0, i).trim()] = t.substring(i + 1).trim();
      }
    });
  }
  return env;
}

function httpGet(url) {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: 2000 }, res => {
      resolve(res.statusCode < 500);
      req.destroy();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { resolve(false); req.destroy(); });
  });
}

function isPortInUse(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(true));
    srv.once('listening', () => { srv.close(); resolve(false); });
    srv.listen(port, '127.0.0.1');
  });
}

async function waitUntilHealthy(name, port, checkPath, timeout) {
  const url = `http://127.0.0.1:${port}${checkPath}`;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await httpGet(url)) {
      log(name, '服务就绪');
      return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  log(name, `等待超时 (${timeout / 1000}s)`);
  return false;
}

// ==================== 进程管理 ====================
async function ensureService(name) {
  const svc = SERVICES[name];

  // 检查端口是否已被占用（说明已有实例在运行）
  if (await isPortInUse(svc.port)) {
    log(name, `端口 ${svc.port} 已被占用，检测已有服务...`);
    const ok = await waitUntilHealthy(name, svc.port, svc.checkPath, 3000);
    if (ok) {
      log(name, `已有实例运行中 (port ${svc.port})，跳过启动`);
      return true;
    }
    log(name, `端口 ${svc.port} 被占用但服务不健康`);
    return false;
  }

  // 检查命令是否存在
  if (!fs.existsSync(svc.command) && !IS_DEV) {
    log(name, `命令不存在: ${svc.command}，跳过`);
    return false;
  }

  // 启动新进程
  log(name, `启动中 (port ${svc.port})...`);
  const env = loadEnvFile(svc.envFile);

  return new Promise((resolve) => {
    const proc = spawn(svc.command, svc.args, {
      cwd: svc.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    procs[name] = proc;

    proc.stdout.on('data', d => log(name, d.toString().replace(/\n$/, '')));
    proc.stderr.on('data', d => {
      const msg = d.toString().replace(/\n$/, '');
      if (/ERROR|Traceback|Error/i.test(msg)) log(name, `[ERR] ${msg}`);
    });
    proc.on('error', err => {
      log(name, `启动失败: ${err.message}`);
      resolve(false);
    });
    proc.on('close', code => {
      log(name, `进程退出 (code: ${code})`);
      delete procs[name];
    });

    // 等待服务就绪
    waitUntilHealthy(name, svc.port, svc.checkPath, svc.startTimeout)
      .then(ok => resolve(ok));
  });
}

function killAll() {
  Object.keys(procs).forEach(name => {
    const p = procs[name];
    if (p) { try { p.kill(); } catch (e) {} delete procs[name]; }
  });
}

// ==================== 托盘 ====================
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
  if (!icon || icon.isEmpty()) icon = nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('3D Scene Generator');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: '重启服务', click: async () => {
      killAll();
      await ensureService('Backend');
      await ensureService('Agent');
      mainWindow?.reload();
    }},
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => mainWindow?.show());
}

// ==================== 安全策略 ====================
// 设置 Content-Security-Policy，消除 Electron 安全警告
function setupSecurity() {
  // 开发模式：需要允许 localhost 的 Vite HMR（eval、ws），生产模式：严格策略
  const csp = IS_DEV
    ? "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' http://localhost:5173; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: http://localhost:* ws://localhost:*; img-src 'self' data: blob: http://localhost:* https:; font-src 'self' data:;"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: http://localhost:* https:; img-src 'self' data: blob: https:; font-src 'self' data:;";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

// ==================== 主窗口 ====================
// 禁用 Electron 安全警告（开发时不需要）
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.on('close', e => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // 先显示 loading
  const loadingPath = path.join(__dirname, 'loading.html');
  if (fs.existsSync(loadingPath)) {
    await mainWindow.loadFile(loadingPath);
    mainWindow.show();
  } else {
    mainWindow.show();
  }

  // 启动服务（自动检测已有实例）
  log('Main', '正在启动服务...');
  await ensureService('Backend');
  await ensureService('Agent');

  // 加载前端
  try {
    if (IS_DEV) {
      log('Main', `加载开发服务器: ${FRONTEND_DEV_URL}`);
      await mainWindow.loadURL(FRONTEND_DEV_URL);
      mainWindow.webContents.openDevTools(); // 开发模式打开调试工具
    } else {
      if (!fs.existsSync(FRONTEND_INDEX)) {
        dialog.showErrorBox('错误', '前端未构建，请先运行 build.bat');
        app.quit();
        return;
      }
      log('Main', `加载前端: ${FRONTEND_INDEX}`);
      await mainWindow.loadFile(FRONTEND_INDEX);
    }
    log('Main', '应用就绪');
  } catch (err) {
    log('Main', `加载前端失败: ${err.message}`);
    dialog.showErrorBox('加载失败', `前端加载失败: ${err.message}\n\n开发模式请确保 Vite 已启动 (npm run dev)`);
  }
}

// ==================== IPC ====================
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return r.filePaths[0] || null;
});

ipcMain.handle('get-app-path', () => APP_ROOT);
ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window-close', () => mainWindow?.close());

ipcMain.handle('get-services-status', async () => ({
  backend: await isPortInUse(SERVICES.Backend.port),
  agent: await isPortInUse(SERVICES.Agent.port),
  backendPort: SERVICES.Backend.port,
  agentPort: SERVICES.Agent.port,
}));

// ==================== 生命周期 ====================
app.isQuitting = false;

app.whenReady().then(async () => {
  setupSecurity();
  createTray();
  await createWindow();
});

app.on('window-all-closed', () => {}); // 托盘模式，不退出

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  else mainWindow?.show();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  killAll();
});

process.on('uncaughtException', error => {
  log('FATAL', error.message);
});
