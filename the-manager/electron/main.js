import { app, BrowserWindow, shell, dialog } from 'electron';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync, writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ─── 2. Run Prisma migrations ─────────────────────────────────────────────────
function runMigrations() {
  // migrations live under backend/prisma/migrations (copied into the package)
  const backendDir = getResourcePath('backend');

  // prisma CLI is now in electron's own node_modules (merged deps)
  const electronDir = app.isPackaged ? app.getAppPath() : __dirname;
  const prismaBin = path.join(electronDir, 'node_modules', '.bin', 'prisma');
  const bin = existsSync(prismaBin + '.cmd') ? prismaBin + '.cmd'   // Windows
            : existsSync(prismaBin)           ? prismaBin            // Mac/Linux
            : 'npx prisma';                                          // fallback

  console.log('📦 Running Prisma migrations from:', backendDir);
  const result = spawnSync(bin, ['migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...process.env },
    shell: true,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error('❌ Prisma migration failed, status:', result.status);
  } else {
    console.log('✅ Migrations applied.');
  }
}

// ─── 3. Start Express server ──────────────────────────────────────────────────
async function isPortInUse(port) {
  return new Promise((resolve) => {
    import('net').then(({ default: net }) => {
      const server = net.createServer();
      server.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
      server.once('listening', () => { server.close(); resolve(false); });
      server.listen(port);
    });
  });
}

async function startBackend() {
  const port = parseInt(process.env.PORT || '3001', 10);

  // Skip starting if the port is already in use (another instance, or dev server)
  if (await isPortInUse(port)) {
    console.log(`ℹ️  Port ${port} already in use — skipping in-process backend start.`);
    return;
  }

  try {
    // Always load server.js from the unpacked real path (not from inside asar)
    const serverPath = getResourcePath('backend', 'src', 'server.js');
    const serverUrl = pathToFileURL(serverPath).href;
    console.log('🚀 Loading server from:', serverPath);
    const { startServer } = await import(serverUrl);
    await startServer();
    console.log('✅ Backend server started.');
  } catch (err) {
    console.error('❌ Failed to start backend server:', err);
    throw err;
  }
}

// ─── 4. Create the browser window ─────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'The Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Allow file:// pages to make requests to http://localhost (our local API)
      webSecurity: false
    }
  });

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
}

// ─── 5. App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    runMigrations();
    await startBackend();
    createWindow();
  } catch (err) {
    console.error('Fatal startup error:', err);
    // Write error to a log file so it can be inspected after a silent crash
    try {
      mkdirSync(userDataPath, { recursive: true });
      const logPath = path.join(userDataPath, 'error.log');
      writeFileSync(logPath, `[${new Date().toISOString()}]\n${err?.stack || String(err)}\n`);
      dialog.showErrorBox('The Manager failed to start', `${err?.message || String(err)}\n\nDetails written to:\n${logPath}`);
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
