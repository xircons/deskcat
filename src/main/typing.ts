export function startTypingMonitor(
  onRate: (keysPerSecond: number) => void,
  onUnavailable: (reason: string) => void
): () => void {
  const timestamps: number[] = [];
  const WINDOW_MS = 4000;
  let hook: { stop(): void } | null = null;

  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.on('keydown', () => {
      try {
        timestamps.push(Date.now());
      } catch {
      }
    });
    uIOhook.start();
    hook = uIOhook;
  } catch (err) {
    onUnavailable(
      'Typing-speed colors are off: system keyboard hook unavailable. ' +
        'On macOS, grant Input Monitoring permission in System Settings → Privacy & Security, then restart the app. ' +
        `(${err instanceof Error ? err.message : String(err)})`
    );
    return () => {};
  }

  if (process.platform === 'darwin') {
    try {
      const { systemPreferences } = require('electron');
      if (!systemPreferences.isTrustedAccessibilityClient(false)) {
        onUnavailable(
          'Typing-speed colors may not work: grant Accessibility and Input Monitoring permissions ' +
            'in System Settings → Privacy & Security, then restart the app.'
        );
      }
    } catch {
    }
  }

  const interval = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();
    onRate(timestamps.length / (WINDOW_MS / 1000));
  }, 250);

  return () => {
    clearInterval(interval);
    try {
      hook?.stop();
    } catch {
    }
  };
}
