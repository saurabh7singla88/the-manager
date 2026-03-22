import { app, BrowserWindow, shell, dialog, globalShortcut } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { existsSync, writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// When packaged with asar:false, app.getAppPath() returns the real resources/app/ directory
// In dev, files sit relative to the electron/ folder
function getResourcePath(...parts) {
  if (app.isPackaged) {
    // resources/app/<parts>
    return path.join(app.getAppPath(), ...parts);
  }
  // Dev: navigate up from electron/ to the-manager/, then into the target folder
  return path.join(__dirname, '..', ...parts);
}

// ─── 1. Set environment variables ────────────────────────────────────────────
// Must be done before importing anything that reads process.env (e.g. server.js)

const userDataPath = app.getPath('userData');

process.env.ELECTRON       = 'true';
process.env.DATABASE_URL   = `file:${path.join(userDataPath, 'app.db')}`;
process.env.PORT            = '3001';
process.env.NODE_ENV        = isDev ? 'development' : 'production';
process.env.ALLOWED_ORIGINS = isDev ? 'http://localhost:5173' : 'file://';

// JWT_SECRET: generate a stable per-device secret persisted in userData
// In a real release you would derive this from a secure keychain entry.
// For now we use a fixed local secret — good enough for a local-only app.
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'desktop-local-jwt-secret-change-for-production';
}

// ─── 2 & 3. Load bundle once, run migrations + start server ─────────────────
// The backend bundle is CJS — require() is synchronous and skips ESM overhead.
// We load it once so both migrations and startServer share the same prisma
// singleton, eliminating the second engine spawn entirely.

let _bundle = null;
function loadBundle() {
  if (_bundle) return _bundle;
  const bundlePath = getResourcePath('backend-bundle', 'server.bundle.cjs');
  console.log('📦 Loading server bundle from:', bundlePath);
  _bundle = require(bundlePath);
  return _bundle;
}

async function runMigrations() {
  const migrationsDir = getResourcePath('backend', 'prisma', 'migrations');
  const { runMigrations: migrate } = loadBundle();
  await migrate(migrationsDir);
}

let _httpServer = null;

async function startBackend() {
  const port = parseInt(process.env.PORT || '3001', 10);

  // Skip if port already in use (another instance or dev server)
  const inUse = await new Promise(resolve => {
    import('net').then(({ default: net }) => {
      const s = net.createServer();
      s.once('error', e => resolve(e.code === 'EADDRINUSE'));
      s.once('listening', () => { s.close(); resolve(false); });
      s.listen(port);
    });
  });
  if (inUse) {
    console.log(`ℹ️  Port ${port} already in use — skipping backend start.`);
    return;
  }

  const { startServer } = loadBundle();
  _httpServer = await startServer();
  console.log('✅ Backend server started.');

  _httpServer.on('close', () => {
    console.warn('⚠️  Backend closed unexpectedly — restarting in 1s…');
    setTimeout(() => startBackend().catch(console.error), 1000);
  });
}

// ─── 4. Create the browser window ─────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'The Manager',
    show: false,               // avoid white flash — show once ready-to-show
    backgroundColor: '#f8fafc', // match app background so flash is invisible
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Allow file:// pages to make requests to http://localhost (our local API)
      webSecurity: false
    }
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    // Dev: load from Vite dev server
    // Default port 5173; override with VITE_PORT env var if Vite picked another
    const vitePort = process.env.VITE_PORT || '5173';
    win.loadURL(`http://localhost:${vitePort}`);
    win.webContents.openDevTools();
  } else {
    // Production: frontend/dist is unpacked at app.asar.unpacked/frontend/dist
    const indexPath = getResourcePath('frontend', 'dist', 'index.html');
    win.loadFile(indexPath);
  }

  // Open external links in the system browser, not inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // DevTools toggle: Cmd+Option+I (Mac) or Ctrl+Shift+I (Win/Linux) or F12
  const toggleDevTools = () => win.webContents.toggleDevTools();
  globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);
  globalShortcut.register('F12', toggleDevTools);
}

// ─── 5. App lifecycle ─────────────────────────────────────────────────────────

// Prevent uncaught backend errors from crashing the entire Electron process.
// Express should catch most errors, but a Prisma engine crash or import error
// can occasionally bubble up as an unhandled rejection.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Attempt backend restart if a server is registered and the error looks like it killed it
  if (_httpServer && !_httpServer.listening) {
    setTimeout(() => startBackend().catch(console.error), 1000);
  }
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
app.whenReady().then(async () => {
  // Show the window immediately — don't block on migrations or backend startup.
  // The frontend handles API unavailability gracefully (shows login page).
  createWindow();

  // Run migrations and backend startup in the background.
  try {
    await runMigrations();
    await startBackend();
  } catch (err) {
    console.error('Fatal startup error:', err);
    try {
      mkdirSync(userDataPath, { recursive: true });
      const logPath = path.join(userDataPath, 'error.log');
      writeFileSync(logPath, `[${new Date().toISOString()}]\n${err?.stack || String(err)}\n`);
      dialog.showErrorBox('The Manager — startup error', `${err?.message || String(err)}\n\nDetails written to:\n${logPath}`);
    } catch (_) { /* ignore secondary errors */ }
    app.quit();
  }

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Quit on all platforms (including macOS) when all windows are closed
  app.quit();
});
