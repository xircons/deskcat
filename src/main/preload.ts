import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petApi', {
  readAsset: (name: string): string => ipcRenderer.sendSync('read-asset', name),
  onCursor: (cb: (p: { x: number; y: number }) => void) =>
    ipcRenderer.on('cursor', (_e, p) => cb(p)),
  onTypingRate: (cb: (rate: number) => void) =>
    ipcRenderer.on('typing-rate', (_e, r) => cb(r)),
  onTypingUnavailable: (cb: (msg: string) => void) =>
    ipcRenderer.on('typing-unavailable', (_e, m) => cb(m)),
  onMood: (cb: (mood: string) => void) => ipcRenderer.on('mood', (_e, m) => cb(m)),
  onReminder: (cb: (info: { reflection: boolean }) => void) =>
    ipcRenderer.on('reminder', (_e, i) => cb(i)),
  saveEntry: (text: string, type: 'note' | 'reflection') =>
    ipcRenderer.invoke('save-entry', { text, type }),
  getToday: () => ipcRenderer.invoke('get-today'),
  moveWindow: (dx: number, dy: number) => ipcRenderer.send('move-window', { dx, dy }),
  ensureOnScreen: () => ipcRenderer.send('ensure-on-screen'),
  getOverhang: () => ipcRenderer.invoke('get-overhang'),
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send('set-ignore-mouse-events', ignore),
});
