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

export class Storage {
  private dir: string;

  constructor() {
    this.dir = path.join(os.homedir(), 'Documents', 'DailyReflection');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private jsonPath(key: string): string {
    return path.join(this.dir, `${key}.json`);
  }

  getToday(): DayLog {
    const key = dateKey();
    try {
      return JSON.parse(fs.readFileSync(this.jsonPath(key), 'utf8'));
    } catch {
      return { date: key, entries: [] };
    }
  }

  addEntry(text: string, type: 'note' | 'reflection'): DayLog {
    const log = this.getToday();
    log.entries.push({ time: new Date().toISOString(), text: text.trim(), type });
    fs.writeFileSync(this.jsonPath(log.date), JSON.stringify(log, null, 2));
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
    fs.writeFileSync(path.join(this.dir, `${log.date}.md`), lines.join('\n'));
  }
}
