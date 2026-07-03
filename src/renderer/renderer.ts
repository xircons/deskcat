interface PetApi {
  readAsset(name: string): string;
  onCursor(cb: (p: { x: number; y: number }) => void): void;
  onTypingRate(cb: (rate: number) => void): void;
  onTypingUnavailable(cb: (msg: string) => void): void;
  onMood(cb: (mood: string) => void): void;
  onReminder(cb: (info: { reflection: boolean }) => void): void;
  saveEntry(text: string, type: 'note' | 'reflection'): Promise<unknown>;
  getToday(): Promise<{ date: string; entries: { time: string; text: string; type: string }[] }>;
  moveWindow(dx: number, dy: number): void;
  ensureOnScreen(): void;
  getOverhang(): Promise<{ left: number; right: number; top: number; bottom: number }>;
  setIgnoreMouseEvents(ignore: boolean): void;
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

type PoseName = 'idle' | 'pl' | 'pr' | 'drag';
const poseFiles: Record<PoseName, string> = {
  idle: 'idle.svg',
  pl: 'press-left.svg',
  pr: 'press-right.svg',
  drag: 'stretch-end.svg',
};
const poseEls = {} as Record<PoseName, HTMLDivElement>;
let currentPose: PoseName = 'idle';

for (const name of Object.keys(poseFiles) as PoseName[]) {
  const div = document.createElement('div');
  div.className = name === 'drag' ? 'pose pose-drag' : 'pose';
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

(function addBrows() {
  const eyes = poseEls.idle.querySelector('[id$="-eyes-js"]');
  if (!eyes || !eyes.parentNode) return;
  const NS = 'http://www.w3.org/2000/svg';
  for (const [x, deg] of [[6.5, 14], [15.5, -14]] as Array<[number, number]>) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('class', 'brow');
    r.setAttribute('x', String(x));
    r.setAttribute('y', '9.4');
    r.setAttribute('width', '6');
    r.setAttribute('height', '1.6');
    r.setAttribute('fill', 'var(--cat-color)');
    r.setAttribute('transform', `rotate(${deg} ${x + 3} 10.2)`);
    eyes.parentNode.appendChild(r);
  }
})();

const pupilEls = {} as Record<PoseName, SVGElement[]>;
for (const name of Object.keys(poseEls) as PoseName[]) {
  pupilEls[name] = Array.from(
    poseEls[name].querySelectorAll<SVGElement>('.pupil-left, .pupil-right')
  );
}

type Mood = 'content' | 'lonely' | 'grumpy';
let mood: Mood = 'content';
let typingRate = 0;
const MAX_RATE = 5;
const KNEAD_MIN = 0.6;

let cursor = { x: 170, y: -200 };

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function heat(): number { return Math.min(typingRate / MAX_RATE, 1); }

function bodyColor(): string {
  const t = heat();
  const calm = [26, 26, 26];
  const mid = [74, 32, 28];
  const hot = [217, 79, 61];
  const c =
    t < 0.5
      ? calm.map((v, i) => lerp(v, mid[i], t / 0.5))
      : mid.map((v, i) => lerp(v, hot[i], (t - 0.5) / 0.5));
  return `rgb(${c.map(Math.round).join(',')})`;
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
  }
}

function updatePupils(faceX: number, faceY: number): void {
  const dx = cursor.x - faceX;
  const dy = cursor.y - faceY;
  const mag = Math.hypot(dx, dy) || 1;
  let px = (dx / mag) * 1.0;
  let py = (dy / mag) * 1.0;
  if (mood === 'lonely') { px = 0; py = 1; }
  const t = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;
  for (const el of pupilEls[currentPose]) {
    el.style.transform = t;
  }
}

let excitedUntil = 0;
let kneadFlip = false;
let lastKneadFlip = 0;

function frame(): void {
  const now = performance.now();

  const rect = bounceEl.getBoundingClientRect();
  const faceX = rect.left + rect.width / 2;
  const faceY = rect.top + rect.height * 0.35;

  chainTick();

  if (phys.dragging || phys.releasing) {
    showPose('drag');
  } else if (typingRate >= KNEAD_MIN) {
    const kneadMs = 1000 / (2.4 + heat() * 4.4);
    if (now - lastKneadFlip > kneadMs) {
      lastKneadFlip = now;
      kneadFlip = !kneadFlip;
    }
    showPose(kneadFlip ? 'pl' : 'pr');
  } else {
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

function applyMood(): void {
  stage.classList.toggle('lonely', mood === 'lonely');
  stage.classList.toggle('grumpy', mood === 'grumpy');
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
  return !!el && (stage.contains(el) || popup.contains(el));
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
    hidePopup();
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

for (const el of [stage, popup]) {
  el.addEventListener('mouseenter', () => setInteractive(true));
  el.addEventListener('mouseleave', () => syncInteractive());
}

let popupMode: 'note' | 'reflection' = 'note';

const POPUP_W = 300;
const POPUP_MAX_H = 300;
const POPUP_EDGE_PAD = 8;
const POPUP_DEFAULT_BOTTOM = 180;

function positionPopup(): void {
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
    popup.style.maxHeight = `${maxH}px`;
    popup.style.bottom = `${bottom}px`;
    popup.style.left = `${left}px`;
  });
}

function showPopup(mode: 'note' | 'reflection'): void {
  popupMode = mode;
  popup.classList.add('visible');
  positionPopup();
  if (mode === 'reflection') {
    popupTitle.textContent = "Today's recap — how was your day?";
    noteInput.placeholder = 'Write your evening reflection…';
    entriesDiv.classList.add('visible');
    entriesDiv.textContent = 'Loading…';
    api.getToday().then((log) => {
      entriesDiv.innerHTML = '';
      const notes = log.entries.filter((e) => e.type === 'note');
      if (!notes.length) {
        entriesDiv.textContent = 'No notes logged today.';
        return;
      }
      for (const e of notes) {
        const d = new Date(e.time);
        const row = document.createElement('div');
        row.className = 'entry';
        const t = document.createElement('span');
        t.className = 't';
        t.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        row.appendChild(t);
        row.appendChild(document.createTextNode(e.text));
        entriesDiv.appendChild(row);
      }
    });
  } else {
    popupTitle.textContent = 'Quick note';
    noteInput.placeholder = 'What just happened?';
    entriesDiv.classList.remove('visible');
  }
  noteInput.focus();
}

function hidePopup(): void {
  popup.classList.remove('visible');
  noteInput.value = '';
}

function togglePopup(): void {
  if (popup.classList.contains('visible')) hidePopup();
  else showPopup('note');
}

function save(): void {
  const text = noteInput.value.trim();
  if (!text) { hidePopup(); return; }
  api.saveEntry(text, popupMode === 'reflection' ? 'reflection' : 'note').then(() => {
    hidePopup();
    purr(2600);
  });
}

saveBtn.addEventListener('click', save);
document.getElementById('closeBtn')!.addEventListener('click', hidePopup);
noteInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
  if (e.key === 'Escape') hidePopup();
});

api.onCursor((p) => {
  if (pointerDown) return;
  cursor = p;
  if (interactive) syncInteractive();
});
api.onTypingRate((r) => { typingRate = r; });
api.onMood((m) => { mood = m as Mood; applyMood(); });
api.onReminder((info) => {
  excitedUntil = Date.now() + 4000;
  showPopup(info.reflection ? 'reflection' : 'note');
});
api.onTypingUnavailable((msg) => {
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 12000);
});

chain = setupChain();
applyChain();
requestAnimationFrame(frame);
