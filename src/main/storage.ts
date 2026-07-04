import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface Entry {
  time: string;
  text: string;
  type: 'note' | 'reflection';
}

export interface DayLog {
  date: string;
  entries: Entry[];
}

function dateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isEntry(e: unknown): e is Entry {
  if (!e || typeof e !== 'object') return false;
  const c = e as Record<string, unknown>;
  return (
    typeof c.time === 'string' &&
    typeof c.text === 'string' &&
    (c.type === 'note' || c.type === 'reflection')
  );
}

export class Storage {
  private dir: string;

  constructor() {
    this.dir = path.join(os.homedir(), 'Documents', 'DailyReflection');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  getDir(): string {
    return this.dir;
  }

  private jsonPath(key: string): string {
    return path.join(this.dir, `${key}.json`);
  }

  private atomicWrite(file: string, data: string): void {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  private quarantine(file: string): void {
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
    }
  }

  private readDay(key: string): DayLog {
    const file = this.jsonPath(key);
    if (!fs.existsSync(file)) return { date: key, entries: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
        return { date: key, entries: parsed.entries.filter(isEntry) };
      }
    } catch {
    }
    this.quarantine(file);
    return { date: key, entries: [] };
  }

  getToday(): DayLog {
    return this.readDay(dateKey());
  }

  getDay(date: string): DayLog {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { date: dateKey(), entries: [] };
    return this.readDay(date);
  }

  listDates(): string[] {
    try {
      return fs
        .readdirSync(this.dir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map((f) => f.slice(0, 10))
        .sort();
    } catch {
      return [];
    }
  }

  addEntry(text: string, type: 'note' | 'reflection'): DayLog {
    const log = this.getToday();
    log.entries.push({ time: new Date().toISOString(), text: text.trim(), type });
    this.atomicWrite(this.jsonPath(log.date), JSON.stringify(log, null, 2));
    this.writeMarkdown(log);
    return log;
  }

  private writeMarkdown(log: DayLog): void {
    const lines: string[] = [`# Daily Reflection — ${log.date}`, ''];
    const notes = log.entries.filter((e) => e.type === 'note');
    const reflections = log.entries.filter((e) => e.type === 'reflection');
    if (notes.length) {
      lines.push('## Notes', '');
      for (const e of notes) {
        const t = new Date(e.time);
        const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
        lines.push(`- **${hm}** — ${e.text}`);
      }
      lines.push('');
    }
    if (reflections.length) {
      lines.push('## Evening reflection', '');
      for (const e of reflections) lines.push(e.text, '');
    }
    this.atomicWrite(path.join(this.dir, `${log.date}.md`), lines.join('\n'));
  }
}
