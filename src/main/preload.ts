import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petApi', {
  readAsset: (name: string): string => ipcRenderer.sendSync('read-asset', name),
  readPreset: (name: string): string => ipcRenderer.sendSync('read-preset', name),
  onCursor: (cb: (p: { x: number; y: number }) => void) =>
    ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onTypingRate: (cb: (rate: number) => void) =>
    ipcRenderer.on('typing-rate', (_e, r) => cb(r)),
  onScrollRate: (cb: (rate: number) => void) =>
    ipcRenderer.on('scroll-rate', (_e, r) => cb(r)),
  onTypingUnavailable: (cb: (msg: string) => void) =>
    ipcRenderer.on('typing-unavailable', (_e, m) => cb(m)),
  onMood: (cb: (mood: string) => void) => ipcRenderer.on('mood', (_e, m) => cb(m)),
  onReminder: (cb: (info: { reflection: boolean; time?: string }) => void) =>
    ipcRenderer.on('reminder', (_e, i) => cb(i)),
  saveEntry: (text: string, type: 'note' | 'reflection') =>
    ipcRenderer.invoke('save-entry', { text, type }),
  getToday: () => ipcRenderer.invoke('get-today'),
  copyText: (text: string) => ipcRenderer.send('copy-text', text),
  moveWindow: (dx: number, dy: number) => ipcRenderer.send('move-window', { dx, dy }),
  ensureOnScreen: () => ipcRenderer.send('ensure-on-screen'),
  hideCat: () => ipcRenderer.send('hide-cat'),
  petCat: () => ipcRenderer.send('pet-cat'),
  getOverhang: () => ipcRenderer.invoke('get-overhang'),
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  onWake: (cb: () => void) => ipcRenderer.on('wake', () => cb()),
  onJump: (cb: () => void) => ipcRenderer.on('jump', () => cb()),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (patch: unknown) => ipcRenderer.invoke('save-config', patch),
  getHistoryDates: () => ipcRenderer.invoke('get-history-dates'),
  getNotesDir: () => ipcRenderer.invoke('get-notes-dir'),
  openNotesFolder: () => ipcRenderer.send('open-notes-folder'),
  getDay: (date: string) => ipcRenderer.invoke('get-day', date),
  onConfig: (cb: (cfg: unknown) => void) => ipcRenderer.on('config', (_e, c) => cb(c)),
  onOpenPanel: (cb: (panel: string) => void) =>
    ipcRenderer.on('open-panel', (_e, p) => cb(p)),
});
