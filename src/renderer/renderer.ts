interface AppConfig {
  reminders: string[];
  reflectionTime: string;
  moodThresholds: { lonelyMinutes: number; grumpyMinutes: number };
  autoStartAtLogin: boolean;
  typing: { maxKeysPerSecond: number };
  reactions: { scroll: boolean; idleStretch: boolean; saveJump: boolean; wakeStretch: boolean };
  pattern: string;
}

interface Spot { x: number; y: number; color: string }
interface PatternData {
  baseColor: string;
  eyeColor: string;
  eyeBgColor: string;
  oddEye: boolean;
  eyeColorLeft: string;
  eyeColorRight: string;
  head: Spot[];
  body: Spot[];
  tail: Spot[];
  earL: Spot[];
  earR: Spot[];
  legFl: Spot[];
  legFr: Spot[];
  legRl: Spot[];
  legRr: Spot[];
}

const PATTERN_ORDER: Array<{ id: string; label: string; img: string }> = [
  { id: 'black', label: 'Black', img: 'black.png' },
  { id: 'white', label: 'Grey', img: 'white.png' },
  { id: 'orange', label: 'Orange', img: 'orange.png' },
  { id: 'siamese', label: 'Siamese', img: 'siamese.png' },
  { id: 'calico', label: 'Calico', img: 'calico.png' },
  { id: 'mackerel', label: 'Tabby', img: 'mackerel.png' },
];

const PATTERNS: Record<string, PatternData> = {};
for (const { id } of PATTERN_ORDER) {
  try {
    const raw = (window as unknown as { petApi: { readPattern(i: string): string } }).petApi.readPattern(id);
    if (raw) PATTERNS[id] = JSON.parse(raw) as PatternData;
  } catch {
    void 0;
  }
}

const PART_SUFFIX: Record<
  keyof Pick<PatternData, 'head' | 'body' | 'tail' | 'earL' | 'earR' | 'legFl' | 'legFr' | 'legRl' | 'legRr'>,
  string
> = {
  head: '-head',
  body: '-body',
  tail: '-tail',
  earL: '-ear-left',
  earR: '-ear-right',
  legFl: '-leg-fl',
  legFr: '-leg-fr',
  legRl: '-leg-rl',
  legRr: '-leg-rr',
};

type CellMap = Record<string, { origin: [number, number]; cells: Record<string, [number, number][]> }>;
const CELLMAP: CellMap = (() => {
  try {
    const raw = (window as unknown as { petApi: { readCellMap(): string } }).petApi.readCellMap();
    return raw ? (JSON.parse(raw) as CellMap) : {};
  } catch {
    return {};
  }
})();

const POSE_SVG_NAME: Partial<Record<string, string>> = {
  pl: 'press-left',
  pr: 'press-right',
  jstart: 'jump-start',
  jing: 'jump-ing',
  scroll: 'scroll-unroll',
  spd: 'stretch-pose-default',
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface PetApi {
  readAsset(name: string): string;
  readPreset(name: string): string;
  readPattern(id: string): string;
  readCellMap(): string;
  onCursor(cb: (p: { x: number; y: number }) => void): void;
  onTypingRate(cb: (rate: number) => void): void;
  onScrollRate(cb: (rate: number) => void): void;
  onTypingUnavailable(cb: (msg: string) => void): void;
  onMood(cb: (mood: string) => void): void;
  onReminder(cb: (info: { reflection: boolean }) => void): void;
  saveEntry(text: string, type: 'note' | 'reflection'): Promise<void>;
  getToday(): Promise<{ date: string; entries: { time: string; text: string; type: string }[] }>;
  copyText(text: string): void;
  moveWindow(dx: number, dy: number): void;
  setPosition(x: number, y: number): void;
  getPosition(): Promise<[number, number]>;
  getDisplayBounds(): Promise<{ x: number; y: number; width: number; height: number }>;
  ensureOnScreen(): void;
  hideCat(): void;
  petCat(): void;
  getOverhang(): Promise<{ left: number; right: number; top: number; bottom: number }>;
  setIgnoreMouseEvents(ignore: boolean): void;
  showContextMenu(): void;
  onWake(cb: () => void): void;
  onJump(cb: () => void): void;
  getConfig(): Promise<AppConfig>;
  saveConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  getHistoryDates(): Promise<string[]>;
  getNotesDir(): Promise<string>;
  openNotesFolder(): void;
  getDay(date: string): Promise<{ date: string; entries: { time: string; text: string; type: string }[] }>;
  onConfig(cb: (cfg: AppConfig) => void): void;
  onOpenPanel(cb: (panel: string) => void): void;
}
const api = (window as unknown as { petApi: PetApi }).petApi;

const stage = document.getElementById('cat-stage')!;
const bounceEl = document.getElementById('cat-bounce')!;
const popup = document.getElementById('popup')!;
const popupTitle = document.getElementById('popupTitle')!;
const entriesDiv = document.getElementById('entries')!;
const noteInput = document.getElementById('noteInput') as HTMLTextAreaElement;
const saveBtn = document.getElementById('saveBtn')!;
const toast = document.getElementById('toast')!;
const notesPanel = document.getElementById('notesPanel')!;
const settingsPanel = document.getElementById('settingsPanel')!;
const allPanels = [popup, notesPanel, settingsPanel];

type PoseName = 'idle' | 'pl' | 'pr' | 'drag' | 'jstart' | 'jing' | 'scroll' | 'spd' | 'spi';
const poseFiles: Record<PoseName, string> = {
  idle: 'idle.svg',
  pl: 'press-left.svg',
  pr: 'press-right.svg',
  drag: 'stretch-end.svg',
  jstart: 'jump-start.svg',
  jing: 'jump-ing.svg',
  scroll: 'scroll-unroll.svg',
  spd: 'stretch-pose-default.svg',
  spi: 'stretch-pose-ing.svg',
};
const poseClasses: Partial<Record<PoseName, string>> = {
  drag: 'pose pose-drag',
  jstart: 'pose pose-jump',
  jing: 'pose pose-jump',
  spd: 'pose pose-spd',
  spi: 'pose pose-spi',
};
const poseEls = {} as Record<PoseName, HTMLDivElement>;
let currentPose: PoseName = 'idle';

for (const name of Object.keys(poseFiles) as PoseName[]) {
  const div = document.createElement('div');
  div.className = poseClasses[name] || 'pose';
  div.innerHTML = api.readAsset(poseFiles[name]);
  (name === 'drag' ? document.body : bounceEl).appendChild(div);
  poseEls[name] = div;
}
poseEls.idle.classList.add('visible');

function showPose(name: PoseName): void {
  if (name === currentPose) return;
  poseEls[currentPose].classList.remove('visible');
  poseEls[name].classList.add('visible');
  currentPose = name;
}

const pupilEls = {} as Record<PoseName, SVGElement[]>;
for (const name of Object.keys(poseEls) as PoseName[]) {
  pupilEls[name] = Array.from(
    poseEls[name].querySelectorAll<SVGElement>('.pupil-left, .pupil-right')
  );
}

type Mood = 'content' | 'lonely' | 'grumpy';
let mood: Mood = 'content';
let typingRate = 0;
let scrollRate = 0;
let MAX_RATE = 5;
const KNEAD_MIN = 0.6;
const SCROLL_MIN = 5;
let reactions = { scroll: true, idleStretch: true, saveJump: true, wakeStretch: true };

let cursor = { x: 170, y: -200 };

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function heat(): number { return Math.min(typingRate / MAX_RATE, 1); }

let themeCalm: [number, number, number] = [26, 26, 26];

function bodyColor(): string {
  const lum = (0.299 * themeCalm[0] + 0.587 * themeCalm[1] + 0.114 * themeCalm[2]) / 255;
  const scale = 1 - Math.min(1, Math.max(0, (lum - 0.35) / 0.6)) * 0.72;
  const t = heat() * scale;
  const hot = [255, 140, 0];
  const mid = themeCalm.map((v, i) => (v + hot[i]) / 2);
  const c =
    t < 0.5
      ? themeCalm.map((v, i) => lerp(v, mid[i], t / 0.5))
      : mid.map((v, i) => lerp(v, hot[i], (t - 0.5) / 0.5));
  return `rgb(${c.map(Math.round).join(',')})`;
}

let savedTheme = 'black';

const PATTERN_POSES: PoseName[] = ['idle', 'pl', 'pr', 'drag', 'jstart', 'jing', 'scroll', 'spd'];

function paintPartSpots(
  poseEl: HTMLElement,
  poseName: PoseName,
  part: keyof typeof PART_SUFFIX,
  spots: Spot[]
): void {
  if (poseName === 'drag' && part === 'body' && typeof chain !== 'undefined' && chain) {
    const { wrappers, lerpData } = chain;
    for (const wrap of wrappers) {
      const slot = wrap.querySelector('.patches');
      if (slot) while (slot.firstChild) slot.removeChild(slot.firstChild);
    }
    const NS = 'http://www.w3.org/2000/svg';
    for (const s of spots) {
      const idx = Math.max(0, Math.min(PHYS.N_SEG - 1, Math.floor(s.y)));
      const wrapper = wrappers[idx];
      const slot = wrapper.querySelector('.patches');
      const ld = lerpData.find(d => d.rect.parentNode === wrapper);
      if (!slot || !ld) continue;
      
      const cw = ld.startW / 22;
      const ch = ld.startH; 
      const ox = ld.startX;
      const oy = ld.startYLocal;
      
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(ox + s.x * cw));
      r.setAttribute('y', String(oy)); 
      r.setAttribute('width', String(cw));
      r.setAttribute('height', String(ch));
      r.setAttribute('fill', s.color);
      slot.appendChild(r);
    }
    return;
  }

  const els = poseEl.querySelectorAll<SVGGElement>(`[id$="${PART_SUFFIX[part]}"]`);
  for (const el of Array.from(els)) {
    let slot = el.querySelector<SVGGElement>('.patches');
    if (!slot) {
      const NS = 'http://www.w3.org/2000/svg';
      slot = document.createElementNS(NS, 'g');
      slot.setAttribute('class', 'patches');
      el.appendChild(slot);
      const pathNode = el.querySelector('path');
      if (pathNode) {
        let defs = poseEl.querySelector('defs');
        const svg = poseEl.querySelector('svg');
        if (!defs && svg) {
          defs = document.createElementNS(NS, 'defs');
          svg.insertBefore(defs, svg.firstChild);
        }
        if (defs) {
          const clipId = `${el.id}-auto-clip`;
          if (!defs.querySelector(`#${clipId}`)) {
            const cp = document.createElementNS(NS, 'clipPath');
            cp.setAttribute('id', clipId);
            cp.appendChild(pathNode.cloneNode(true));
            defs.appendChild(cp);
          }
          slot.setAttribute('clip-path', `url(#${clipId})`);
        }
      }
    }
    while (slot.firstChild) slot.removeChild(slot.firstChild);
    const NS = 'http://www.w3.org/2000/svg';
    const svgName = POSE_SVG_NAME[poseName];
    const map = svgName && (part === 'head' || part === 'body') ? CELLMAP[`${svgName}:${part}`] : undefined;
    const frame = el.getAttribute('data-patch-frame');
    if (map) {
      const [ox, oy] = map.origin;
      for (const s of spots) {
        const cell = map.cells[`${s.x},${s.y}`];
        if (!cell) continue;
        for (const [dx, dy] of cell) {
          const r = document.createElementNS(NS, 'rect');
          r.setAttribute('x', String(ox + dx));
          r.setAttribute('y', String(oy + dy));
          r.setAttribute('width', '1');
          r.setAttribute('height', '1');
          r.setAttribute('fill', s.color);
          slot.appendChild(r);
        }
      }
      continue;
    }
    if (!frame) continue;
    const [ox, oy, cw, ch] = frame.split(/\s+/).map(Number);
    for (const s of spots) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(ox + s.x * cw));
      r.setAttribute('y', String(oy + s.y * ch));
      r.setAttribute('width', String(cw));
      r.setAttribute('height', String(ch));
      r.setAttribute('fill', s.color);
      slot.appendChild(r);
    }
  }
}

function paintPattern(p: PatternData): void {
  for (const name of PATTERN_POSES) {
    const el = poseEls[name];
    for (const key of Object.keys(PART_SUFFIX) as Array<keyof typeof PART_SUFFIX>) {
      paintPartSpots(el, name, key, p[key]);
    }
  }
}

function applyTheme(id: string): void {
  const p = PATTERNS[id] || PATTERNS.black;
  if (!p) return;
  const base = hexToRgb(p.baseColor) || [26, 26, 26];
  themeCalm = base;
  const lum = (0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]) / 255;
  document.documentElement.style.setProperty('--eye-bg-color', p.eyeBgColor);
  document.documentElement.style.setProperty('--cat-outline', lum > 0.5 ? '#1a1a1a' : '#ffffff');
  if (p.oddEye) {
    document.documentElement.style.setProperty('--eye-color-left', p.eyeColorLeft);
    document.documentElement.style.setProperty('--eye-color-right', p.eyeColorRight);
  } else {
    document.documentElement.style.removeProperty('--eye-color-left');
    document.documentElement.style.removeProperty('--eye-color-right');
    document.documentElement.style.setProperty('--eye-color', p.eyeColor);
  }
  paintPattern(p);
  lastBodyColor = '';
}

const HEAD_ANCHOR_SHIFT_Y = 235.5;

const phys = createPhysicsState();
let pointerDown = false;

interface LerpDatum {
  rect: SVGRectElement;
  useTransform: boolean;
  startX: number; endX: number;
  startYLocal: number; endYLocal: number;
  startW: number; endW: number;
  startH: number; endH: number;
}
interface LegGroup { el: SVGGElement; delta: number; segIdx: number }
interface ChainData {
  wrappers: SVGGElement[];
  segHeight: number;
  bodyYmin: number;
  lerpData: LerpDatum[];
  tailGroup: SVGGElement | null;
  tailStartY: number | null;
  tailEndY: number | null;
  legGroups: LegGroup[];
}
let chain: ChainData | null = null;

function parseFirstMy(d: string | null): number | null {
  const m = (d || '').match(/M\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[2]) : null;
}
function parseTranslateY(t: string | null): number {
  const m = (t || '').match(/translate\(\s*-?[\d.]+(?:[\s,]+(-?[\d.]+))?/);
  return m && m[1] != null ? parseFloat(m[1]) : 0;
}
function isChainBaseRect(r: Element): boolean {
  return (
    !r.classList.contains('heat-overlay') &&
    !r.closest('.heat-overlay') &&
    !r.closest('.patches') &&
    !r.closest('defs') &&
    !r.closest('clipPath') &&
    !r.classList.contains('stm')
  );
}
function rectGeom(r: SVGRectElement): { x: number; y: number; useTransform: boolean } {
  if (r.hasAttribute('x') || r.hasAttribute('y')) {
    return {
      x: parseFloat(r.getAttribute('x') || '0'),
      y: parseFloat(r.getAttribute('y') || '0'),
      useTransform: false,
    };
  }
  const m = (r.getAttribute('transform') || '').match(
    /translate\(\s*([\d.\-]+)(?:[\s,]+([\d.\-]+))?\s*\)/
  );
  return {
    x: m ? parseFloat(m[1]) : 0,
    y: m && m[2] !== undefined ? parseFloat(m[2]) : 0,
    useTransform: !!m,
  };
}
function setRectXY(rect: SVGRectElement, x: number, y: number, useTransform: boolean): void {
  if (useTransform) rect.setAttribute('transform', `translate(${x} ${y})`);
  else {
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
  }
}

function setupChain(): ChainData | null {
  const root = poseEls.drag.querySelector('svg');
  if (!root) return null;
  root.setAttribute('viewBox', '-20 -2 80 148');
  root.setAttribute('preserveAspectRatio', 'xMidYMin meet');

  const startDoc = new DOMParser().parseFromString(
    api.readAsset('stretch-start.svg'),
    'image/svg+xml'
  );
  const startRects = Array.from(startDoc.querySelectorAll('rect')).filter(isChainBaseRect) as SVGRectElement[];
  const startXs: number[] = [], startYs: number[] = [], startWs: number[] = [], startHs: number[] = [];
  startRects.forEach((r, i) => {
    const g = rectGeom(r);
    startXs[i] = g.x;
    startYs[i] = g.y;
    startWs[i] = parseFloat(r.getAttribute('width') || '0');
    startHs[i] = parseFloat(r.getAttribute('height') || '0');
  });
  const startTail = startDoc.querySelector('[id$="tail-path"]');
  const tailStartY = startTail ? parseFirstMy(startTail.getAttribute('d')) : null;

  const allRects = (Array.from(root.querySelectorAll('rect')) as SVGRectElement[]).filter(isChainBaseRect);
  const rectInfo = allRects.map((r, idx) => {
    const g = rectGeom(r);
    return {
      rect: r, x: g.x, y: g.y, useTransform: g.useTransform, origIdx: idx,
      w: parseFloat(r.getAttribute('width') || '0'),
      h: parseFloat(r.getAttribute('height') || '0'),
    };
  });

  const bodyRects = rectInfo.filter((rd) => rd.y + rd.h >= 25);
  if (!bodyRects.length) return null;
  const bodyYmin = Math.min(...bodyRects.map((rd) => rd.y));
  const bodyYmax = Math.max(...bodyRects.map((rd) => rd.y + rd.h));
  const segHeight = (bodyYmax - bodyYmin) / PHYS.N_SEG;

  const segments: Array<{ rects: typeof rectInfo }> = [];
  for (let i = 0; i < PHYS.N_SEG; i++) segments.push({ rects: [] });
  for (const rd of bodyRects) {
    const cy = rd.y + rd.h / 2;
    const idx = Math.min(PHYS.N_SEG - 1, Math.max(0, Math.floor((cy - bodyYmin) / segHeight)));
    segments[idx].rects.push(rd);
  }

  const lerpData: LerpDatum[] = [];
  for (let i = 0; i < PHYS.N_SEG; i++) {
    const cumulativeY = bodyYmin + i * segHeight;
    for (const rd of segments[i].rects) {
      const sy = startYs[rd.origIdx] !== undefined ? startYs[rd.origIdx] : rd.y;
      lerpData.push({
        rect: rd.rect,
        useTransform: rd.useTransform,
        startX: startXs[rd.origIdx] !== undefined ? startXs[rd.origIdx] : rd.x,
        endX: rd.x,
        startYLocal: sy - cumulativeY,
        endYLocal: rd.y - cumulativeY,
        startW: startWs[rd.origIdx] !== undefined ? startWs[rd.origIdx] : rd.w,
        endW: rd.w,
        startH: startHs[rd.origIdx] !== undefined ? startHs[rd.origIdx] : rd.h,
        endH: rd.h,
      });
      rd.rect.remove();
    }
  }

  const catContent = (root.querySelector('[id$="-cat-content"]') || root) as SVGElement;
  let parent: SVGElement = catContent;
  const wrappers: SVGGElement[] = [];
  const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < PHYS.N_SEG; i++) {
    const wrap = document.createElementNS(NS, 'g') as SVGGElement;
    for (const rd of segments[i].rects) wrap.appendChild(rd.rect);
    const patches = document.createElementNS(NS, 'g');
    patches.setAttribute('class', 'patches');
    wrap.appendChild(patches);
    parent.appendChild(wrap);
    parent = wrap;
    wrappers.push(wrap);
  }
  if (catContent && wrappers.length) {
    catContent.insertBefore(wrappers[0], catContent.firstChild);
    const tailEl = catContent.querySelector(':scope > [id$="-tail"]');
    if (tailEl) catContent.insertBefore(tailEl, catContent.firstChild);
  }

  const legGroups: LegGroup[] = [];
  for (const suffix of ['-leg-fl', '-leg-fr', '-leg-rl', '-leg-rr']) {
    const el = root.querySelector(`[id$="${suffix}"]`) as SVGGElement | null;
    if (!el) continue;
    const delta = parseFloat(el.getAttribute('data-stretch-y-delta') || '0');
    let cy = bodyYmin + segHeight;
    if (el.hasAttribute('data-stretch-cy')) {
      cy = parseFloat(el.getAttribute('data-stretch-cy')!);
    }
    const segIdx = Math.min(PHYS.N_SEG - 1, Math.max(0, Math.floor((cy - bodyYmin) / segHeight)));
    legGroups.push({ el, delta, segIdx });
  }

  const tailPath = root.querySelector('path[id$="-tail-path"]');
  const tailGroup = (root.querySelector('g[id$="-tail"]') || tailPath) as SVGGElement | null;
  const tailLocalY = tailPath ? parseFirstMy(tailPath.getAttribute('d')) : null;
  const tailTy = tailPath ? parseTranslateY(tailPath.getAttribute('transform')) : 0;
  const tailEndY = tailLocalY !== null ? tailLocalY + tailTy : null;

  return { wrappers, segHeight, bodyYmin, lerpData, tailGroup, tailStartY, tailEndY, legGroups };
}

function applyChain(): void {
  if (!chain) return;
  const { wrappers, segHeight, bodyYmin, lerpData, tailGroup, tailStartY, tailEndY, legGroups } = chain;

  for (let i = 0; i < wrappers.length; i++) {
    const ty = i === 0 ? bodyYmin : segHeight;
    wrappers[i].setAttribute('transform', `translate(${phys.dxState[i].toFixed(3)} ${ty.toFixed(3)})`);
  }

  for (const ld of lerpData) {
    const x = ld.startX + (ld.endX - ld.startX) * phys.stretchT;
    const y = ld.startYLocal + (ld.endYLocal - ld.startYLocal) * phys.stretchT;
    setRectXY(ld.rect, x, y, ld.useTransform);
    ld.rect.setAttribute('width', Math.max(0, ld.startW + (ld.endW - ld.startW) * phys.stretchT).toFixed(3));
    ld.rect.setAttribute('height', Math.max(0, ld.startH + (ld.endH - ld.startH) * phys.stretchT).toFixed(3));

    const parent = ld.rect.parentNode as SVGGElement;
    const patches = parent?.querySelector('.patches');
    if (patches && ld.startH > 0 && ld.startW > 0) {
      const heightRatio = Math.max(0, ld.startH + (ld.endH - ld.startH) * phys.stretchT) / ld.startH;
      const scaleX = Math.max(0, ld.startW + (ld.endW - ld.startW) * phys.stretchT) / ld.startW;
      patches.setAttribute('transform', `translate(${x} ${y}) scale(${scaleX} ${heightRatio}) translate(${-ld.startX} ${-ld.startYLocal})`);
    }
  }

  for (const lg of legGroups) {
    const ty = lg.delta * (1 - phys.stretchT);
    let dx = 0;
    for (let i = 0; i <= lg.segIdx; i++) dx += phys.dxState[i];
    lg.el.setAttribute('transform', `translate(${dx.toFixed(3)} ${ty.toFixed(3)})`);
  }

  if (tailGroup && tailEndY !== null && tailStartY !== null) {
    let tailDx = 0;
    for (let i = 0; i < phys.dxState.length; i++) tailDx += phys.dxState[i];
    const offsetY = (tailStartY - tailEndY) * (1 - phys.stretchT);
    tailGroup.setAttribute('transform', `translate(${tailDx.toFixed(3)} ${offsetY.toFixed(2)})`);
  }
}

let chainIdleApplied = false;

function chainTick(): void {
  if (!chain) return;
  if (physicsSettled(phys)) {
    if (!chainIdleApplied) {
      applyChain();
      chainIdleApplied = true;
    }
    return;
  }
  chainIdleApplied = false;

  const releaseComplete = physicsTick(phys, Date.now());
  applyChain();

  if (releaseComplete) {
    applyChain();
    showPose('idle');
    api.moveWindow(0, -HEAD_ANCHOR_SHIFT_Y);
    api.ensureOnScreen();
    syncInteractive();
    document.body.classList.remove('dragging');
    const openNow = allPanels.find((p) => p.classList.contains('visible'));
    if (openNow) positionPanel(openNow);
  }
}

function updatePupils(faceX: number, faceY: number): void {
  const dx = cursor.x - faceX;
  const dy = cursor.y - faceY;
  const mag = Math.hypot(dx, dy) || 1;
  let px = (dx / mag) * 1.0;
  let py = (dy / mag) * 1.0;
  if (mood === 'lonely') { px = 0; py = 1; }
  if (mood === 'grumpy' || reminderAngry) {
    px *= 0.4;
    py = 1;
  }
  const t = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;
  for (const el of pupilEls[currentPose]) {
    el.style.transform = t;
  }
}

let excitedUntil = 0;
let kneadFlip = false;
let lastKneadFlip = 0;

const JUMP_CROUCH_MS = 170;
const JUMP_TOTAL_MS = 620;
let jumpT0 = -Infinity;

const FIDGET_MS = 3000;
const WAKE_SPD1_MS = 350;
const WAKE_SPI_MS = 1650;
const WAKE_TOTAL_MS = 2000;
const FIDGET_IDLE_MS = 180000;
const FIDGET_JITTER_MS = 120000;
let stretchMode: 'fidget' | 'wake' | null = null;
let stretchT0 = 0;
let idleSince = performance.now();
let fidgetJitter = Math.random() * FIDGET_JITTER_MS;

function startStretch(mode: 'fidget' | 'wake'): void {
  if (phys.dragging || phys.releasing) return;
  stretchMode = mode;
  stretchT0 = performance.now();
  if (mode === 'fidget') {
    poseEls.spd.classList.remove('stretching');
    void poseEls.spd.offsetWidth;
    poseEls.spd.classList.add('stretching');
  }
}

function cancelStretch(now: number): void {
  stretchMode = null;
  poseEls.spd.classList.remove('stretching');
  idleSince = now;
  fidgetJitter = Math.random() * FIDGET_JITTER_MS;
}

function triggerJump(): void {
  if (stretchMode) cancelStretch(performance.now());
  jumpT0 = performance.now();
  stage.classList.add('jumping');
  setTimeout(() => stage.classList.remove('jumping'), JUMP_TOTAL_MS);
}

let isChangingSkin = false;

function triggerSkinChangeAnimation(newTheme: string) {
  if (isChangingSkin) return;
  isChangingSkin = true;
  
  Promise.all([api.getPosition(), api.getDisplayBounds()]).then(([[startX, startY], bounds]) => {
    let currentX = startX;
    const speed = 15;
    
    const distToLeft = startX - bounds.x;
    const distToRight = (bounds.x + bounds.width) - startX;
    const runToLeftEdge = distToLeft < distToRight;
    
    const targetEdgeX = runToLeftEdge ? bounds.x - 120 : bounds.x + bounds.width;
    const distToEdge = Math.abs(targetEdgeX - startX);
    const ticksToEdge = Math.max(30, Math.ceil(distToEdge / speed));
    
    const velToEdge = runToLeftEdge ? -speed : speed;
    const velFromEdge = runToLeftEdge ? speed : -speed;
    
    let ticks = 0;
    const runInterval = setInterval(() => {
      ticks++;
      
      if (ticks <= ticksToEdge) {
        currentX += velToEdge;
        api.setPosition(currentX, startY);
        showPose(ticks % 6 < 3 ? 'pl' : 'pr');
      }
      
      if (ticks === ticksToEdge) {
        applyTheme(newTheme);
      } else if (ticks > ticksToEdge && ticks <= ticksToEdge * 2) {
        currentX += velFromEdge;
        api.setPosition(currentX, startY);
        showPose(ticks % 6 < 3 ? 'pl' : 'pr');
      } else if (ticks > ticksToEdge * 2) {
        clearInterval(runInterval);
        isChangingSkin = false;
        showPose('idle');
        api.setPosition(startX, startY);
      }
    }, 16);
  });
}

function frame(): void {
  const now = performance.now();

  const rect = bounceEl.getBoundingClientRect();
  const faceX = rect.left + rect.width / 2;
  const faceY = rect.top + rect.height * 0.35;

  chainTick();

  if (isChangingSkin) {
    updatePupils(faceX, faceY);
    requestAnimationFrame(frame);
    return;
  }

  if (phys.dragging || phys.releasing) {
    if (stretchMode) cancelStretch(now);
    idleSince = now;
    showPose('drag');
  } else if (now - jumpT0 < JUMP_TOTAL_MS) {
    showPose(now - jumpT0 < JUMP_CROUCH_MS ? 'jstart' : 'jing');
  } else if (reactions.scroll && scrollRate >= SCROLL_MIN && typingRate < KNEAD_MIN) {
    if (stretchMode) cancelStretch(now);
    idleSince = now;
    showPose('scroll');
  } else if (typingRate >= KNEAD_MIN) {
    if (stretchMode) cancelStretch(now);
    idleSince = now;
    const kneadMs = 1000 / (2.4 + heat() * 4.4);
    if (now - lastKneadFlip > kneadMs) {
      lastKneadFlip = now;
      kneadFlip = !kneadFlip;
    }
    showPose(kneadFlip ? 'pl' : 'pr');
  } else if (stretchMode) {
    const st = now - stretchT0;
    const total = stretchMode === 'fidget' ? FIDGET_MS : WAKE_TOTAL_MS;
    if (st >= total) {
      cancelStretch(now);
      showPose('idle');
    } else if (stretchMode === 'fidget') {
      showPose('spd');
    } else {
      showPose(st < WAKE_SPD1_MS ? 'spd' : st < WAKE_SPI_MS ? 'spi' : 'spd');
    }
  } else {
    if (reactions.idleStretch && now - idleSince > FIDGET_IDLE_MS + fidgetJitter) {
      startStretch('fidget');
    }
    showPose('idle');
  }

  stage.classList.toggle('hot', heat() > 0.8);
  stage.classList.toggle('excited', Date.now() < excitedUntil);

  updatePupils(faceX, faceY);
  requestAnimationFrame(frame);
}

document.documentElement.style.setProperty('--eye-color', '#0a0a0a');

let lastBodyColor = '';
setInterval(() => {
  const c = bodyColor();
  if (c !== lastBodyColor) {
    lastBodyColor = c;
    document.documentElement.style.setProperty('--cat-color', c);
  }
}, 150);

(function blinkLoop() {
  const delay = 2800 + Math.random() * 4200;
  setTimeout(() => {
    document.documentElement.classList.add('blinking');
    setTimeout(() => document.documentElement.classList.remove('blinking'), 260);
    blinkLoop();
  }, delay);
})();

function purr(ms: number): void {
  document.documentElement.classList.add('purring');
  setTimeout(() => document.documentElement.classList.remove('purring'), ms);
}

let reminderAngry = false;

function applyMood(): void {
  const grumpy = mood === 'grumpy' || reminderAngry;
  stage.classList.toggle('lonely', mood === 'lonely' && !reminderAngry);
  stage.classList.toggle('grumpy', grumpy);
}

const DRAG_START_THRESHOLD_PX = 4;

let downAt = 0;
let lastX = 0, lastY = 0;
let downX = 0, downY = 0;

let interactive = false;
function setInteractive(v: boolean): void {
  if (v === interactive) return;
  interactive = v;
  api.setIgnoreMouseEvents(!v);
}

function overInteractive(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y);
  return !!el && (stage.contains(el) || allPanels.some((p) => p.contains(el)));
}

function syncInteractive(): void {
  if (pointerDown) {
    setInteractive(true);
    return;
  }
  setInteractive(overInteractive(cursor.x, cursor.y));
}

stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  pointerDown = true;
  idleSince = performance.now();
  downAt = Date.now();
  lastX = e.screenX;
  lastY = e.screenY;
  downX = e.screenX;
  downY = e.screenY;
});

stage.addEventListener('pointermove', (e) => {
  cursor = { x: e.clientX, y: e.clientY };
  if (!pointerDown) return;
  const moved = Math.hypot(e.screenX - downX, e.screenY - downY);
  if (!phys.dragging && moved > DRAG_START_THRESHOLD_PX) {
    physicsStartDrag(phys, Date.now());
    document.body.classList.add('dragging');
    showPose('drag');
    api.moveWindow(0, HEAD_ANCHOR_SHIFT_Y);
  }
  if (!phys.dragging) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  if (dx !== 0 || dy !== 0) {
    api.moveWindow(dx, dy);
    physicsDragImpulse(phys, dx, Date.now());
    lastX = e.screenX;
    lastY = e.screenY;
  }
});

function endPointer(wasCancelled: boolean): void {
  if (!pointerDown) return;
  pointerDown = false;
  if (phys.dragging) {
    physicsEndDrag(phys);
  } else if (!wasCancelled && Date.now() - downAt < 350) {
    togglePopup();
  }
  syncInteractive();
}

stage.addEventListener('pointerup', () => endPointer(false));
stage.addEventListener('pointercancel', () => endPointer(true));
stage.addEventListener('lostpointercapture', () => endPointer(true));

let petQueue: { x: number; y: number; time: number }[] = [];
let lastPetTime = 0;

stage.addEventListener('mousemove', (e: MouseEvent) => {
  if (pointerDown || allPanels.some(p => p.classList.contains('visible'))) return;
  const now = performance.now();
  if (now - lastPetTime < 3000) return; 
  
  petQueue.push({ x: e.clientX, y: e.clientY, time: now });
  petQueue = petQueue.filter(p => now - p.time < 1500);

  let dist = 0;
  for (let i = 1; i < petQueue.length; i++) {
    const dx = petQueue[i].x - petQueue[i - 1].x;
    const dy = petQueue[i].y - petQueue[i - 1].y;
    dist += Math.sqrt(dx * dx + dy * dy);
  }

  if (dist > 1000) {
    lastPetTime = now;
    petQueue = [];
    api.petCat();
    purr(2500);
  }
});

stage.addEventListener('contextmenu', (e: MouseEvent) => {
  e.preventDefault();
  endPointer(true);
  api.showContextMenu();
});

for (const el of [stage, ...allPanels]) {
  el.addEventListener('mouseenter', () => setInteractive(true));
  el.addEventListener('mouseleave', () => syncInteractive());
}

let popupMode: 'note' | 'reflection' | 'reminder-note' = 'note';

const POPUP_W = 300;
const POPUP_MAX_H = 300;
const POPUP_EDGE_PAD = 8;
const POPUP_DEFAULT_BOTTOM = 180;

function positionPanel(panel: HTMLElement): void {
  api.getOverhang().then((o) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const maxH = Math.min(POPUP_MAX_H, H - o.top - POPUP_EDGE_PAD * 2);
    const bottom = Math.max(
      o.bottom + 4,
      Math.min(POPUP_DEFAULT_BOTTOM, H - o.top - POPUP_EDGE_PAD - maxH)
    );
    const left = Math.max(
      o.left + POPUP_EDGE_PAD,
      Math.min((W - POPUP_W) / 2, W - o.right - POPUP_W - POPUP_EDGE_PAD)
    );
    panel.style.maxHeight = `${maxH}px`;
    panel.style.bottom = `${bottom}px`;
    panel.style.left = `${left}px`;
  });
}

function hideAllPanels(): void {
  for (const p of allPanels) p.classList.remove('visible');
  noteInput.value = '';
  reminderAngry = false;
  applyMood();
  applyTheme(savedTheme);
  syncInteractive();
}

function openPanel(panel: HTMLElement): void {
  idleSince = performance.now();
  for (const p of allPanels) {
    if (p !== panel) p.classList.remove('visible');
  }
  panel.classList.add('visible');
  positionPanel(panel);
}

function buildReflectionTemplate(todayNotes: string[]): string {
  const lines: string[] = ['Daily Reflection', '', '1. สิ่งที่ทำวันนี้'];
  if (todayNotes.length) {
    for (const n of todayNotes) lines.push(`- ${n}`);
  } else {
    lines.push('- ');
  }
  lines.push('', '2. ความคืบหน้าเทียบกับเป้าหมาย', '- ', '', '3. ปัญหา / อุปสรรค', '- ');
  return lines.join('\n');
}

function showPopup(mode: 'note' | 'reflection' | 'reminder-note', time?: string): void {
  popupMode = mode;
  openPanel(popup);
  popup.classList.toggle('reminder', mode === 'reminder-note' || mode === 'reflection');
  popup.classList.toggle('reflection', mode === 'reflection');
  reminderAngry = mode === 'reminder-note' || mode === 'reflection';
  applyMood();
  if (mode === 'reflection') {
    popupTitle.textContent = 'Daily Reflection';
    entriesDiv.classList.remove('visible');
    noteInput.value = buildReflectionTemplate([]);
    api.getToday().then((log) => {
      const notes = log.entries.filter((e) => e.type === 'note');
      noteInput.value = buildReflectionTemplate(notes.map((e) => e.text));
    });
  } else {
    popupTitle.textContent = mode === 'reminder-note' ? 'REMINDER NOTE!' : 'QUICK NOTE';
    if (mode === 'reminder-note' && time) {
      noteInput.placeholder = `What did you do before ${time}?`;
    } else {
      noteInput.placeholder = "What's on your mind?";
    }
    entriesDiv.classList.remove('visible');
  }
  noteInput.focus();
}

function hidePopup(): void {
  popup.classList.remove('visible');
  popup.classList.remove('reminder');
  popup.classList.remove('reflection');
  noteInput.value = '';
  reminderAngry = false;
  applyMood();
}

function togglePopup(): void {
  if (popup.classList.contains('visible')) hidePopup();
  else showPopup('note');
}

let historyDates: string[] = [];
let historyIdx = 0;
const dayLabel = document.getElementById('dayLabel')!;
const dayPicker = document.getElementById('dayPicker') as HTMLInputElement;
const dayEntries = document.getElementById('dayEntries')!;
const prevDayBtn = document.getElementById('prevDay') as HTMLButtonElement;
const nextDayBtn = document.getElementById('nextDay') as HTMLButtonElement;

function renderLogEntries(log: any): void {
  dayEntries.innerHTML = '';
  if (!log || !log.entries || !log.entries.length) {
    dayEntries.textContent = 'Nothing logged this day.';
    return;
  }
  for (const e of log.entries) {
    const d = new Date(e.time);
    const row = document.createElement('div');
    row.className = 'entry';
    if (e.type === 'reflection') {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'recap';
      row.appendChild(tag);
    }
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    row.appendChild(t);
    row.appendChild(document.createTextNode(e.text));
    dayEntries.appendChild(row);
  }
}

dayPicker.addEventListener('change', () => {
  const d = dayPicker.value;
  if (!d) return;
  const idx = historyDates.indexOf(d);
  if (idx !== -1) {
    historyIdx = idx;
    renderHistoryDay();
  } else {
    dayLabel.textContent = d.replace(/-/g, '/');
    prevDayBtn.disabled = true;
    nextDayBtn.disabled = true;
    dayEntries.textContent = 'Loading…';
    api.getDay(d).then((log) => {
      if (dayPicker.value !== d) return;
      renderLogEntries(log);
    });
  }
});

function renderHistoryDay(): void {
  if (!historyDates.length) {
    dayLabel.textContent = '—';
    dayPicker.value = '';
    dayEntries.textContent = 'No notes yet. Click the cat to write one.';
    prevDayBtn.disabled = true;
    nextDayBtn.disabled = true;
    return;
  }
  const date = historyDates[historyIdx];
  dayLabel.textContent = date.replace(/-/g, '/');
  dayPicker.value = date;
  prevDayBtn.disabled = historyIdx === 0;
  nextDayBtn.disabled = historyIdx === historyDates.length - 1;
  dayEntries.textContent = 'Loading…';
  api.getDay(date).then((log) => {
    if (dayPicker.value !== date) return;
    renderLogEntries(log);
  });
}

function showNotesPanel(): void {
  openPanel(notesPanel);
  dayEntries.textContent = 'Loading…';
  api.getHistoryDates().then((dates) => {
    historyDates = dates;
    historyIdx = Math.max(0, dates.length - 1);
    renderHistoryDay();
  });
}

prevDayBtn.addEventListener('click', () => {
  if (historyIdx > 0) {
    historyIdx--;
    renderHistoryDay();
  }
});
nextDayBtn.addEventListener('click', () => {
  if (historyIdx < historyDates.length - 1) {
    historyIdx++;
    renderHistoryDay();
  }
});

const setReminders = document.getElementById('setReminders') as HTMLInputElement;
setReminders.addEventListener('input', () => {
  const clean = setReminders.value.replace(/[^0-9:,\s]/g, '');
  if (clean !== setReminders.value) setReminders.value = clean;
});
const setReflection = document.getElementById('setReflection') as HTMLInputElement;
const setLonely = document.getElementById('setLonely') as HTMLInputElement;
const setGrumpy = document.getElementById('setGrumpy') as HTMLInputElement;
const setTyping = document.getElementById('setTyping') as HTMLInputElement;
const setAutostart = document.getElementById('setAutostart') as HTMLInputElement;
const setScroll = document.getElementById('setScroll') as HTMLInputElement;
const setIdleStretch = document.getElementById('setIdleStretch') as HTMLInputElement;
const setSaveJump = document.getElementById('setSaveJump') as HTMLInputElement;
const setWakeStretch = document.getElementById('setWakeStretch') as HTMLInputElement;
const themeGrid = document.getElementById('themeGrid')!;
const notesDirEl = document.getElementById('notesDir')!;
const settingsMsg = document.getElementById('settingsMsg')!;

let selectedTheme = 'black';
const themeSwatches = new Map<string, HTMLButtonElement>();

function markSelectedTheme(id: string): void {
  for (const [tid, el] of themeSwatches) el.classList.toggle('selected', tid === id);
}

function pickTheme(id: string): void {
  selectedTheme = id;
  markSelectedTheme(id);
}

for (const { id, label, img } of PATTERN_ORDER) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-swatch';
  const src = api.readPreset(img);
  const base = (PATTERNS[id] && hexToRgb(PATTERNS[id].baseColor)) || [26, 26, 26];
  const imgTag = src
    ? `<img src="${src}" alt="${label}" draggable="false" />`
    : `<span class="theme-fallback" style="background:rgb(${base.join(',')})"></span>`;
  btn.innerHTML = `${imgTag}<span class="theme-name">${label}</span>`;
  btn.addEventListener('click', () => pickTheme(id));
  themeGrid.appendChild(btn);
  themeSwatches.set(id, btn);
}

const settingsSaveBtn = document.getElementById('settingsSaveBtn')!;

const settingsTabBtns = Array.from(
  settingsPanel.querySelectorAll<HTMLButtonElement>('.tab-btn')
);
const settingsTabPages = Array.from(
  settingsPanel.querySelectorAll<HTMLElement>('.tab-page')
);

function selectSettingsTab(tab: string): void {
  for (const b of settingsTabBtns) b.classList.toggle('active', b.dataset.tab === tab);
  for (const p of settingsTabPages) p.classList.toggle('visible', p.dataset.page === tab);
}

for (const btn of settingsTabBtns) {
  btn.addEventListener('click', () => selectSettingsTab(btn.dataset.tab || 'general'));
}

document.getElementById('openNotesBtn')!.addEventListener('click', () => api.openNotesFolder());

function fillSettings(cfg: AppConfig): void {
  setReminders.value = cfg.reminders.join(', ');
  setReflection.value = cfg.reflectionTime;
  setLonely.value = String(cfg.moodThresholds.lonelyMinutes);
  setGrumpy.value = String(cfg.moodThresholds.grumpyMinutes);
  setTyping.value = String(cfg.typing.maxKeysPerSecond);
  setAutostart.checked = cfg.autoStartAtLogin;
  setScroll.checked = cfg.reactions.scroll;
  setIdleStretch.checked = cfg.reactions.idleStretch;
  setSaveJump.checked = cfg.reactions.saveJump;
  setWakeStretch.checked = cfg.reactions.wakeStretch;
  selectedTheme = cfg.pattern || 'black';
  markSelectedTheme(selectedTheme);
}

function showSettingsPanel(): void {
  openPanel(settingsPanel);
  selectSettingsTab('general');
  settingsMsg.textContent = '';
  settingsMsg.className = 'hint';
  api.getConfig().then(fillSettings);
  api.getNotesDir().then((dir) => {
    notesDirEl.textContent = dir;
    notesDirEl.setAttribute('title', dir);
  });
}

function settingsError(msg: string): void {
  settingsMsg.textContent = msg;
  settingsMsg.className = 'hint error';
}

settingsSaveBtn.addEventListener('click', () => {
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const times = setReminders.value
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const bad = times.find((t) => !HHMM.test(t));
  if (bad) {
    settingsError(`Invalid time: ${bad} (use HH:MM)`);
    return;
  }
  const reflection = setReflection.value;
  if (!HHMM.test(reflection)) {
    settingsError('Pick a reflection time');
    return;
  }
  const lonely = Number(setLonely.value);
  const grumpy = Number(setGrumpy.value);
  if (!Number.isFinite(lonely) || lonely < 1 || !Number.isFinite(grumpy) || grumpy < 1) {
    settingsError('Mood minutes must be 1 or more');
    return;
  }
  const rate = Number(setTyping.value);
  if (!Number.isFinite(rate) || rate < 1 || rate > 30) {
    settingsError('Typing rate must be 1-30');
    return;
  }
  if (!times.includes(reflection)) times.push(reflection);
  api
    .saveConfig({
      reminders: times,
      reflectionTime: reflection,
      moodThresholds: { lonelyMinutes: lonely, grumpyMinutes: grumpy },
      autoStartAtLogin: setAutostart.checked,
      typing: { maxKeysPerSecond: rate },
      reactions: {
        scroll: setScroll.checked,
        idleStretch: setIdleStretch.checked,
        saveJump: setSaveJump.checked,
        wakeStretch: setWakeStretch.checked,
      },
      pattern: selectedTheme,
    })
    .then((cfg) => {
      if (selectedTheme !== savedTheme) {
        triggerSkinChangeAnimation(selectedTheme);
      }
      fillSettings(cfg);
      settingsMsg.textContent = '';
      const originalText = settingsSaveBtn.textContent;
      settingsSaveBtn.textContent = 'Saved!';
      setTimeout(() => {
        settingsSaveBtn.textContent = originalText || 'Save';
      }, 2000);
      purr(1500);
    });
});

const settingsTestReminderBtn = document.getElementById('settingsTestReminderBtn');
if (settingsTestReminderBtn) {
  settingsTestReminderBtn.addEventListener('click', () => {
    excitedUntil = Date.now() + 4000;
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    showPopup('reminder-note', t);
  });
}

function save(): void {
  const text = noteInput.value.trim();
  if (!text) { hidePopup(); return; }
  api.saveEntry(text, popupMode === 'reflection' ? 'reflection' : 'note').then(() => {
    hidePopup();
    if (reactions.saveJump) triggerJump();
    purr(2600);
  });
}

saveBtn.addEventListener('click', save);
const skipBtn = document.getElementById('skipBtn');
if (skipBtn) {
  skipBtn.addEventListener('click', () => {
    hideAllPanels();
    purr(1200);
  });
}
const copyBtn = document.getElementById('copyBtn');
if (copyBtn) {
  copyBtn.addEventListener('click', () => {
    const text = noteInput.value;
    if (!text.trim()) return;
    api.copyText(text);
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = original || 'Copy';
    }, 1500);
  });
}
for (const btn of document.querySelectorAll('.panel-close')) {
  btn.addEventListener('click', hideAllPanels);
}
noteInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideAllPanels();
});

api.onCursor((p) => {
  if (pointerDown) return;
  cursor = p;
  if (interactive) syncInteractive();
});
api.onTypingRate((r) => { typingRate = r; });
api.onScrollRate((r) => { scrollRate = r; });
api.onJump(() => triggerJump());
api.onMood((m) => { mood = m as Mood; applyMood(); });
api.onReminder((info: { reflection: boolean; time?: string }) => {
  excitedUntil = Date.now() + 4000;
  showPopup(info.reflection ? 'reflection' : 'reminder-note', info.time);
});
api.onTypingUnavailable((msg) => {
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 12000);
});
api.onConfig((cfg) => {
  if (!cfg) return;
  if (cfg.typing && Number.isFinite(cfg.typing.maxKeysPerSecond)) {
    MAX_RATE = cfg.typing.maxKeysPerSecond;
  }
  if (cfg.reactions) reactions = { ...reactions, ...cfg.reactions };
  if (typeof cfg.pattern === 'string') {
    savedTheme = cfg.pattern;
    if (!isChangingSkin) applyTheme(cfg.pattern);
  }
});
api.onOpenPanel((panel) => {
  if (panel === 'note') showPopup('note');
  else if (panel === 'notes') showNotesPanel();
  else if (panel === 'settings') showSettingsPanel();
});
api.onWake(() => {
  if (reactions.wakeStretch) startStretch('wake');
});

chain = setupChain();
applyChain();
requestAnimationFrame(frame);
