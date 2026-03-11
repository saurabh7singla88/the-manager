import { app, BrowserWindow, shell, dialog, globalShortcut } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';

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
// Uses @prisma/client's $executeRawUnsafe to apply migration SQL files directly
// — no dependency on better-sqlite3 or the prisma CLI binary.
async function runMigrations() {
  const logPath = path.join(userDataPath, 'migration.log');
  mkdirSync(userDataPath, { recursive: true });
  const logEntry = (msg) => appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

  const dbPath  = path.join(userDataPath, 'app.db');
  const migrationsDir = getResourcePath('backend', 'prisma', 'migrations');

  logEntry(`DB: ${dbPath}`);
  logEntry(`Migrations dir: ${migrationsDir}`);

  try {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const { PrismaClient } = req('@prisma/client');

    const prisma = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}` } },
      log: [],
    });

    await prisma.$connect();

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id                      TEXT PRIMARY KEY,
        checksum                TEXT NOT NULL,
        finished_at             DATETIME,
        migration_name          TEXT NOT NULL,
        logs                    TEXT,
        rolled_back_at          DATETIME,
        started_at              DATETIME NOT NULL DEFAULT current_timestamp,
        applied_steps_count     INTEGER NOT NULL DEFAULT 0
      )
    `);

    const rows = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'
    );
    const applied = new Set(rows.map(r => r.migration_name));

    const { readdirSync, readFileSync } = await import('fs');
    let folders = [];
    try {
      folders = readdirSync(migrationsDir)
        .filter(f => !f.startsWith('.') && f !== 'migration_lock.toml')
        .sort();
    } catch {
      logEntry('WARN migrations directory not found — skipping');
      await prisma.$disconnect();
      return;
    }

    let appliedCount = 0;
    for (const folder of folders) {
      if (applied.has(folder)) continue;
      const sqlFile = path.join(migrationsDir, folder, 'migration.sql');
      if (!existsSync(sqlFile)) continue;

      const sql = readFileSync(sqlFile, 'utf8');
      logEntry(`Applying migration: ${folder}`);
      try {
        const statements = sql
          .split(';')
          .map(s => s.replace(/--[^\n]*/g, '').trim())
          .filter(s => s.length > 0);
        for (const stmt of statements) {
          await prisma.$executeRawUnsafe(stmt);
        }
        await prisma.$executeRawUnsafe(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
           VALUES ('${folder}-id', 'n/a', datetime('now'), '${folder}', 1)`
        );
        appliedCount++;
        logEntry(`OK: ${folder}`);
      } catch (e) {
        logEntry(`ERROR applying ${folder}: ${e.message}`);
        await prisma.$disconnect();
        throw new Error(`Migration "${folder}" failed: ${e.message}`);
      }
    }

    await prisma.$disconnect();
    logEntry(appliedCount > 0 ? `Done — ${appliedCount} migration(s) applied` : 'No new migrations');
  } catch (err) {
    logEntry('FATAL: ' + err.message);
    throw err;
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

let _httpServer = null; // track the live http.Server so we can detect crashes

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
    _httpServer = await startServer();
    console.log('✅ Backend server started.');

    // If the server closes unexpectedly, restart it automatically
    _httpServer.on('close', () => {
      console.warn('⚠️  Backend server closed unexpectedly — restarting in 1s…');
      setTimeout(() => startBackend().catch(console.error), 1000);
    });
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
