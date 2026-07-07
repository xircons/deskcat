# DeskCat (Daily Pet)

> **Cat artwork adapted from [Catjang](https://github.com/cloud9209/catjang-sue)** by jan (nerfspeed on Discord), CC BY-NC 4.0 — see [CREDITS.md](CREDITS.md). 
> **Software Codebase:** Released under the MIT License by pppwtk. (Note: Due to the CC BY-NC 4.0 license on the artwork, the project as a whole is **non-commercial only**).

A highly optimized pixel-art cat that floats on your screen all day and helps you jot quick notes, so your evening reflection doesn't start from a blank memory. 

Built with **Electron**, **TypeScript**, and a custom physics engine leveraging GPU hardware acceleration and Object Pooling for buttery smooth interactions.

## Architecture & Code Organization

The application is structured following modern Electron best practices with strict separation of concerns and peak performance in mind:

- **Main Process (`src/main/`)**: Handles window management, tray icon, global shortcuts, and file storage.
  - `main.ts`: Application lifecycle, Tray menu, and window creation.
  - `config.ts`: Configuration loading and saving.
  - `storage.ts`: Atomic writes for daily JSON and Markdown files.
  - `typing.ts`: Global keystroke monitoring using `uiohook-napi`.
  - `preload.ts`: Secure context bridge exposing strictly typed IPC methods.

- **Renderer Process (`src/renderer/`)**: Handles the DOM, GPU-accelerated physics loop, SVG rendering, and user interface.
  - `renderer.ts`: Manages cat states, dynamic skin patterns via DOM Object Pooling, and Event-Driven click-through toggling.
  - `physics.ts`: Custom spring-damper physics engine for drag-and-drop elastic interactions.

### High-Performance Optimizations
- **Event-Driven Hover State**: Clicks pass through to the desktop effortlessly using native Chromium `mouseenter`/`mouseleave` event listeners, eliminating expensive frame-by-frame DOM polling.
- **Hardware Acceleration**: The dangling physics simulation calculates elastic stretching and offloads rendering to the GPU using inline CSS `translate3d` and `scale3d` transforms, completely eliminating browser Layout/Reflow thrashing.
- **DOM Object Pooling**: Changing the cat's skin or pattern utilizes an intelligent object pool. SVG `<rect>` elements are recycled and toggled via `display: block/none` rather than being destroyed and recreated, preventing massive Garbage Collection (GC) sweeps and memory leaks.

### Security Posture
- **Node Integration**: Disabled in the renderer process.
- **Context Isolation**: Enabled, ensuring the renderer cannot access Node.js APIs directly.
- **ASAR Safe Paths**: Fully utilizes `app.getAppPath()` for bulletproof asset resolution in production builds.

## Run & Build

```bash
# Install dependencies
npm install

# Run locally in development
npm start

# Build a production DMG for macOS
npm run dist
```

Primary target is macOS.

### macOS Permissions
Typing-speed detection requires **Input Monitoring** permission (System Settings -> Privacy & Security -> Input Monitoring). Only keystroke *frequency* is counted — key content is never read, stored, or sent anywhere. 

*If permission is denied or missing accessibility trust, the app keeps working; the cat will simply remain in its idle state and show a one-time toast notice.*

## Features and Interactions

- **Skins & Patterns**: The cat's visual pattern updates dynamically (via the object-pooled renderer) based on user configuration or state!
- **System Tray**: Provides a menu to manually "Show Cat" or "Hide Cat", "Give Treat", "Quick Note", "Settings", and "Quit".
- **Give Treat**: Trigger a jump animation and improve the cat's mood instantly.
- **Click**: Open the quick-note popup (Cmd/Ctrl+Enter saves, Esc closes).
- **Click and Drag**: Move the cat anywhere on the screen. The physics engine calculates elastic stretching, momentum, and swing as you drag.
- **Pass-through Clicks**: The transparent window lets clicks pass through to your desktop whenever you are not hovering over the cat or popup.
- **Eyes**: Follow your mouse cursor everywhere on the screen.
- **Mood**: Transitions from content to lonely (60 minutes past a reminder with no entry) to grumpy (180 minutes). Saving an entry cheers it up instantly.

## Reminders & Reflection

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
