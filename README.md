# Daily Pet 🐈‍⬛

> Cat artwork adapted from [Catjang](https://github.com/jandev-png/catjang) by jan (nerfspeed on Discord), CC BY-NC 4.0 — see [CREDITS.md](CREDITS.md). Because of that license this project is **non-commercial only**.

A pixel-art cat that floats on your screen all day and helps you jot quick notes, so your evening reflection doesn't start from a blank memory.

## Run

```bash
npm install
npm start
```

Primary target is macOS; the code avoids Mac-only APIs where possible.

### macOS permission

Typing-speed colors require **Input Monitoring** permission (System Settings → Privacy & Security → Input Monitoring). Only keystroke *frequency* is counted — key content is never read, stored, or sent anywhere. If permission is denied, the app keeps working; the cat just stays its calm color and shows a one-time notice.

## Using the cat

- **Click** the cat → quick-note popup (⌘/Ctrl+Enter saves, Esc closes)
- **Click-hold and drag** → the cat stretches elastically toward your cursor and springs back on release
- **⌘-drag (Ctrl-drag on Windows)** → move the cat anywhere on screen
- **Eyes** follow your mouse everywhere on screen
- **Body color** warms from near-black toward red as your system-wide typing speed rises
- **Mood** (independent of color): content → lonely (60 min past a reminder with no entry) → grumpy (180 min). Any saved entry cheers it up instantly. The mood clock pauses while the screen is locked or the Mac is asleep. Never darker than grumpy, never any sound or blocking popup.

## Reminders & reflection

At each time in `config.json` (`reminders`, default 11:30 / 14:30 / 16:00 / 17:00) the cat bounces with red alert marks and opens the note popup. The final one (`reflectionTime`, default 17:00) shows the day's notes in order plus a field for an evening reflection.

## Storage

Everything is local, one file per day in `~/Documents/DailyReflection/`:
`YYYY-MM-DD.md` (human-readable) and `YYYY-MM-DD.json` (app data). No network calls, no analytics.

## config.json

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
