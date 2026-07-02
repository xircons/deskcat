import { app, BrowserWindow, ipcMain, screen, powerMonitor } from 'electron';
import * as path from 'path';
import { loadConfig, Config } from './config';
import { Storage } from './storage';
import { startTypingMonitor } from './typing';

let win: BrowserWindow | null = null;
let cfg: Config;
const storage = new Storage();

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

function sendMood(): void {
  win?.webContents.send('mood', currentMood());
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 340,
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
      sandbox: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(app.getAppPath(), 'src', 'renderer', 'index.html'));

  const { workArea } = screen.getPrimaryDisplay();
  win.setPosition(workArea.x + workArea.width - 380, workArea.y + workArea.height - 580);
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
    win?.webContents.send('reminder', { reflection });
    sendMood();
  }
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
    if (!win) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 33);

  startTypingMonitor(
    (rate) => win?.webContents.send('typing-rate', rate),
    (msg) => win?.webContents.send('typing-unavailable', msg)
  );

  powerMonitor.on('lock-screen', () => (screenAsleep = true));
  powerMonitor.on('suspend', () => (screenAsleep = true));
  powerMonitor.on('unlock-screen', () => (screenAsleep = false));
  powerMonitor.on('resume', () => (screenAsleep = false));

  setInterval(() => {
    if (!screenAsleep && !entrySinceReminder) {
      awakeMsSinceReminder += 15000;
      sendMood();
    }
  }, 15000);

  setInterval(tickScheduler, 20000);
  tickScheduler();
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.handle('save-entry', (_e, { text, type }: { text: string; type: 'note' | 'reflection' }) => {
  if (!text || !text.trim()) return storage.getToday();
  const log = storage.addEntry(text, type);
  entrySinceReminder = true;
  awakeMsSinceReminder = 0;
  sendMood();
  return log;
});

ipcMain.handle('get-today', () => storage.getToday());

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

ipcMain.on('move-window', (_e, { dx, dy }: { dx: number; dy: number }) => {
  if (!win) return;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const [x, y] = win.getPosition();
  safeSetPosition(x + dx, y + dy);
});

ipcMain.on('ensure-on-screen', () => {
  if (!win) return;
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width);
  const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height);
  if (x !== b.x || y !== b.y) safeSetPosition(x, y);
});
