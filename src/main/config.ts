import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  reminders: string[];
  reflectionTime: string;
  moodThresholds: { lonelyMinutes: number; grumpyMinutes: number };
  autoStartAtLogin: boolean;
  typing: { maxKeysPerSecond: number };
}

const DEFAULTS: Config = {
  reminders: ['11:30', '14:30', '16:00', '17:00'],
  reflectionTime: '17:00',
  moodThresholds: { lonelyMinutes: 60, grumpyMinutes: 180 },
  autoStartAtLogin: true,
  typing: { maxKeysPerSecond: 5 },
};

export function loadConfig(): Config {
  const file = path.join(app.getAppPath(), 'config.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ...DEFAULTS,
      ...raw,
      moodThresholds: { ...DEFAULTS.moodThresholds, ...(raw.moodThresholds || {}) },
      typing: { ...DEFAULTS.typing, ...(raw.typing || {}) },
    };
  } catch (err) {
    console.warn('config.json missing or invalid, using defaults:', err);
    return { ...DEFAULTS };
  }
}
