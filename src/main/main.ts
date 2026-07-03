import { app, BrowserWindow, ipcMain, screen, powerMonitor } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, Config } from './config';
import { Storage } from './storage';
import { startTypingMonitor } from './typing';

let win: BrowserWindow | null = null;
let cfg: Config;
let stopTypingMonitor: (() => void) | null = null;
const storage = new Storage();

const CAT_SIDE_MARGIN = 160;
const CAT_TOP_MARGIN = 330;
const MAX_ENTRY_LENGTH = 10000;

type Mood = 'content' | 'lonely' | 'grumpy';

let entrySinceReminder = true;
let awakeMsSinceReminder = 0;
let screenAsleep = false;

function currentMood(): Mood {
  if (entrySinceReminder) return 'content';
  const mins = awakeMsSinceReminder / 60000;
  if (mins >= cfg.moodThresholds.grumpyMinutes) return 'grumpy';
  if (mins >= cfg.moodThresholds.lonelyMinutes) return 'lonely';
  return 'content';
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function sendMood(): void {
  sendToRenderer('mood', currentMood());
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 480,
    height: 500,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(app.getAppPath(), 'src', 'renderer', 'index.html'));

  win.webContents.on('render-process-gone', () => {
    if (!win || win.isDestroyed()) return;
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.reload();
  });

  win.on('closed', () => {
    win = null;
  });

  const { workArea } = screen.getPrimaryDisplay();
  win.setPosition(workArea.x + 40 - CAT_SIDE_MARGIN, workArea.y + workArea.height - 500);
}

const firedToday = new Map<string, string>();

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function today(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tickScheduler(): void {
  const now = new Date();
  const t = hhmm(now);
  if (cfg.reminders.includes(t) && firedToday.get(t) !== today(now)) {
    firedToday.set(t, today(now));
    entrySinceReminder = false;
    awakeMsSinceReminder = 0;
    const reflection = t === cfg.reflectionTime;
    sendToRenderer('reminder', { reflection });
    sendMood();
  }
}

function safeSetPosition(x: number, y: number): void {
  if (!win) return;
  const ix = Math.trunc(x);
  const iy = Math.trunc(y);
  if (!Number.isInteger(ix) || !Number.isInteger(iy)) return;
  try {
    win.setPosition(ix, iy);
  } catch {
  }
}

function clampToScreen(): void {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const x = Math.min(
    Math.max(b.x, wa.x - CAT_SIDE_MARGIN),
    wa.x + wa.width - b.width + CAT_SIDE_MARGIN
  );
  const y = Math.min(Math.max(b.y, wa.y - CAT_TOP_MARGIN), wa.y + wa.height - b.height);
  if (x !== b.x || y !== b.y) safeSetPosition(x, y);
}

app.whenReady().then(() => {
  cfg = loadConfig();

  if (process.platform === 'darwin') app.dock?.hide();

  try {
    app.setLoginItemSettings({ openAtLogin: cfg.autoStartAtLogin });
  } catch (err) {
    console.warn('Could not set login item:', err);
  }

  createWindow();

  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    sendToRenderer('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 33);

  stopTypingMonitor = startTypingMonitor(
    (rate) => sendToRenderer('typing-rate', rate),
    (msg) => sendToRenderer('typing-unavailable', msg)
  );

  powerMonitor.on('lock-screen', () => (screenAsleep = true));
  powerMonitor.on('suspend', () => (screenAsleep = true));
  powerMonitor.on('unlock-screen', () => (screenAsleep = false));
  powerMonitor.on('resume', () => (screenAsleep = false));

  screen.on('display-removed', () => clampToScreen());
  screen.on('display-metrics-changed', () => clampToScreen());

  setInterval(() => {
    if (!screenAsleep && !entrySinceReminder) {
      awakeMsSinceReminder += 15000;
      sendMood();
    }
  }, 15000);

  setInterval(tickScheduler, 20000);
  tickScheduler();
});

app.on('will-quit', () => {
  stopTypingMonitor?.();
});

app.on('window-all-closed', () => {
  app.quit();
});

const ASSET_DIR = path.join(__dirname, '..', '..', 'assets', 'cat');

ipcMain.on('read-asset', (e, name: unknown) => {
  try {
    if (typeof name !== 'string' || !name) throw new Error('invalid asset name');
    e.returnValue = fs.readFileSync(path.join(ASSET_DIR, path.basename(name)), 'utf8');
  } catch {
    e.returnValue = '';
  }
});

ipcMain.handle('save-entry', (_e, payload: unknown) => {
  const p = payload as { text?: unknown; type?: unknown } | null;
  const text = p && typeof p.text === 'string' ? p.text.trim().slice(0, MAX_ENTRY_LENGTH) : '';
  const type = p?.type === 'reflection' ? 'reflection' : 'note';
  if (!text) return storage.getToday();
  const log = storage.addEntry(text, type);
  entrySinceReminder = true;
  awakeMsSinceReminder = 0;
  sendMood();
  return log;
});

ipcMain.handle('get-today', () => storage.getToday());

ipcMain.on('move-window', (_e, payload: unknown) => {
  if (!win) return;
  const p = payload as { dx?: unknown; dy?: unknown } | null;
  if (!p || typeof p.dx !== 'number' || typeof p.dy !== 'number') return;
  if (!Number.isFinite(p.dx) || !Number.isFinite(p.dy)) return;
  const [x, y] = win.getPosition();
  safeSetPosition(x + p.dx, y + p.dy);
});

ipcMain.on('set-ignore-mouse-events', (_e, ignore: unknown) => {
  if (typeof ignore !== 'boolean') return;
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.handle('get-overhang', () => {
  if (!win) return { left: 0, right: 0, top: 0, bottom: 0 };
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  return {
    left: Math.max(0, wa.x - b.x),
    right: Math.max(0, b.x + b.width - (wa.x + wa.width)),
    top: Math.max(0, wa.y - b.y),
    bottom: Math.max(0, b.y + b.height - (wa.y + wa.height)),
  };
});

ipcMain.on('ensure-on-screen', () => clampToScreen());
