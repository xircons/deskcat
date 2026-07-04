# Daily Pet

> Cat artwork adapted from [Catjang](https://github.com/jandev-png/catjang) by jan (nerfspeed on Discord), CC BY-NC 4.0 — see [CREDITS.md](CREDITS.md). Because of that license this project is **non-commercial only**.

A pixel-art cat that floats on your screen all day and helps you jot quick notes, so your evening reflection doesn't start from a blank memory. 

Built with **Electron**, **TypeScript**, and an independent physics engine for smooth, interactive animations.

## Architecture & Code Organization

The application is structured following modern Electron best practices with strict separation of concerns:

- **Main Process (src/main/)**: Handles window management, tray icon, global shortcuts, and file storage.
  - `main.ts`: Application lifecycle, Tray menu, and window creation.
  - `config.ts`: Configuration loading and saving (auto-start, reminder thresholds).
  - `storage.ts`: Atomic writes for daily JSON and Markdown files.
  - `typing.ts`: Global keystroke monitoring using `uiohook-napi`.
  - `preload.ts`: Secure context bridge exposing strict IPC methods to the renderer.

- **Renderer Process (src/renderer/)**: Handles the DOM, physics loop, SVG rendering, and user interface.
  - `renderer.ts`: Manages cat states (idle, jumping, dragging), DOM interactions, and IPC communication.
  - `physics.ts`: Custom spring-damper physics engine for drag-and-drop interactions.

### Security Posture
The application is designed with strict security boundaries:
- **Node Integration**: Disabled in the renderer process.
- **Context Isolation**: Enabled, ensuring the renderer cannot access Node.js APIs directly.
- **Sandbox**: Enabled for the renderer process.
- **IPC Validation**: All IPC channels are strictly typed and exposed via `contextBridge`.

## Run

```bash
npm install
npm start
```

Primary target is macOS; the code avoids Mac-only APIs where possible.

### macOS permission

Typing-speed colors require **Input Monitoring** permission (System Settings -> Privacy & Security -> Input Monitoring). Only keystroke *frequency* is counted — key content is never read, stored, or sent anywhere. The app monitors keys globally via `uiohook-napi`. 

*If permission is denied or missing accessibility trust, the app keeps working; the cat stays its calm color and shows a one-time toast notice.*

## Features and Interactions

- **Right-Click**: Hide the cat (it will run off the screen). It will automatically return on the next reminder.
- **System Tray**: Provides a menu to manually "Show Cat" or "Hide Cat", "Give Treat", "Quick Note", "Settings", and "Quit".
- **Give Treat**: Trigger a jump animation and improve the cat's mood instantly.
- **Click**: Open the quick-note popup (Cmd/Ctrl+Enter saves, Esc closes).
- **Click and Drag**: Move the cat anywhere on the screen. The physics engine calculates elastic stretching, momentum, and swing as you drag.
- **Pass-through Clicks**: The transparent window lets clicks pass through to your desktop whenever you are not hovering over the cat or popup.
- **Eyes**: Follow your mouse cursor everywhere on the screen.
- **Body Color**: Warms from near-black toward red as your system-wide typing speed rises.
- **Mood**: Transitions from content to lonely (60 minutes past a reminder with no entry) to grumpy (180 minutes). Saving an entry cheers it up instantly.

## Reminders & reflection

At each time in `config.json` (`reminders`, default 11:30 / 14:30 / 16:00 / 17:00) the cat bounces with red alert marks and opens the note popup. The final one (`reflectionTime`, default 17:00) shows the day's notes in order plus a field for an evening reflection.

## Storage & Safety

Everything is local, one file per day in `~/Documents/DailyReflection/`:
`YYYY-MM-DD.md` (human-readable) and `YYYY-MM-DD.json` (app data). 

- **Atomic Writes:** All data is saved safely using temp files and renaming, preventing data loss if your computer crashes. Corrupted JSONs are automatically quarantined.
- **No Analytics:** No network calls are ever made.

## Configuration (config.json)

```json
{
  "reminders": ["11:30", "14:30", "16:00", "17:00"],
  "reflectionTime": "17:00",
  "moodThresholds": { "lonelyMinutes": 60, "grumpyMinutes": 180 },
  "autoStartAtLogin": true,
  "typing": { "maxKeysPerSecond": 5 }
}
```

Edit and restart the app — no code changes needed. `autoStartAtLogin` toggles launch-at-login.
