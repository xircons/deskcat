export function startTypingMonitor(
  onRate: (keysPerSecond: number) => void,
  onUnavailable: (reason: string) => void
): void {
  const timestamps: number[] = [];
  const WINDOW_MS = 4000;

  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.on('keydown', () => {
      timestamps.push(Date.now());
    });
    uIOhook.start();
  } catch (err) {
    onUnavailable(
      'Typing-speed colors are off: system keyboard hook unavailable. ' +
        'On macOS, grant Input Monitoring permission in System Settings → Privacy & Security, then restart the app. ' +
        `(${err instanceof Error ? err.message : String(err)})`
    );
    return;
  }

  setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();
    onRate(timestamps.length / (WINDOW_MS / 1000));
  }, 250);
}
