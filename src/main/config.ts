import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  reminders: string[];
  reflectionTime: string;
  moodThresholds: { lonelyMinutes: number; grumpyMinutes: number };
  autoStartAtLogin: boolean;
  typing: { maxKeysPerSecond: number };
  reactions: { scroll: boolean; idleStretch: boolean; saveJump: boolean; wakeStretch: boolean };
}

const DEFAULTS: Config = {
  reminders: ['11:30', '14:30', '16:00', '17:00'],
  reflectionTime: '17:00',
  moodThresholds: { lonelyMinutes: 5, grumpyMinutes: 10 },
  autoStartAtLogin: true,
  typing: { maxKeysPerSecond: 5 },
  reactions: { scroll: true, idleStretch: true, saveJump: true, wakeStretch: true },
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function userConfigFile(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfigFile(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
  }
  return null;
}

export function sanitizeConfig(raw: unknown): Partial<Config> {
  const out: Partial<Config> = {};
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  if (Array.isArray(src.reminders)) {
    const times = src.reminders.filter(
      (t): t is string => typeof t === 'string' && HHMM.test(t)
    );
    out.reminders = [...new Set(times)].sort().slice(0, 24);
  }
  if (typeof src.reflectionTime === 'string' && HHMM.test(src.reflectionTime)) {
    out.reflectionTime = src.reflectionTime;
  }
  if (src.moodThresholds && typeof src.moodThresholds === 'object') {
    const m = src.moodThresholds as Record<string, unknown>;
    const lonely = Number(m.lonelyMinutes);
    const grumpy = Number(m.grumpyMinutes);
    if (Number.isFinite(lonely) && lonely >= 1 && Number.isFinite(grumpy) && grumpy >= 1) {
      out.moodThresholds = {
        lonelyMinutes: Math.round(lonely),
        grumpyMinutes: Math.round(grumpy),
      };
    }
  }
  if (typeof src.autoStartAtLogin === 'boolean') out.autoStartAtLogin = src.autoStartAtLogin;
  if (src.typing && typeof src.typing === 'object') {
    const rate = Number((src.typing as Record<string, unknown>).maxKeysPerSecond);
    if (Number.isFinite(rate) && rate >= 1 && rate <= 30) {
      out.typing = { maxKeysPerSecond: rate };
    }
  }
  if (src.reactions && typeof src.reactions === 'object') {
    const r = src.reactions as Record<string, unknown>;
    out.reactions = {
      scroll: typeof r.scroll === 'boolean' ? r.scroll : DEFAULTS.reactions.scroll,
      idleStretch: typeof r.idleStretch === 'boolean' ? r.idleStretch : DEFAULTS.reactions.idleStretch,
      saveJump: typeof r.saveJump === 'boolean' ? r.saveJump : DEFAULTS.reactions.saveJump,
      wakeStretch: typeof r.wakeStretch === 'boolean' ? r.wakeStretch : DEFAULTS.reactions.wakeStretch,
    };
  }
  return out;
}

export function mergeConfig(base: Config, patch: Partial<Config>): Config {
  return {
    ...base,
    ...patch,
    moodThresholds: { ...base.moodThresholds, ...(patch.moodThresholds || {}) },
    typing: { ...base.typing, ...(patch.typing || {}) },
    reactions: { ...base.reactions, ...(patch.reactions || {}) },
  };
}

export function saveConfig(cfg: Config): void {
  const file = userConfigFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn('Could not save config:', err);
  }
}

export function loadConfig(): Config {
  let raw = readConfigFile(userConfigFile());
  if (!raw) raw = readConfigFile(path.join(app.getAppPath(), 'config.json'));
  const cfg = mergeConfig(DEFAULTS, sanitizeConfig(raw || {}));
  saveConfig(cfg);
  return cfg;
}
