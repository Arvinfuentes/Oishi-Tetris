import '@fontsource/press-start-2p';
import './style.css';
import { Game, COLS, ROWS, HIDDEN, SHAPES } from './game';

type State = 'ready' | 'play' | 'paused' | 'over';
type Action = 'left' | 'right' | 'down' | 'cw' | 'ccw' | 'hold' | 'drop' | 'pause';

const CELL = 56, DAS = 170, ARR = 50, OVER_LOCKOUT_MS = 800, CLEAR_MS = 500;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ctxOf = (id: string) => $<HTMLCanvasElement>(id).getContext('2d')!;
const board = ctxOf('board'), holdCtx = ctxOf('hold'), nextCtx = ctxOf('next');
const overlay = $('overlay'), ovTitle = $('ov-title'), ovSub = $('ov-sub'), ovBtn = $('ov-btn');
const scoreEl = $('score'), levelEl = $('level');

// Piece colours alternate brown / purple: I,T,Z,L brown; O,S,J purple.
const skins = ['brown', 'purple'].map((n) => {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}art/${n}.png`;
  return img;
});
const splash = new Image();
splash.src = `${import.meta.env.BASE_URL}art/splash.png`;
let clearT = 0;

const g = new Game();
let state: State = 'ready', dirty = true, overAt = 0;
let best = 0;
try { best = Number(localStorage.getItem('pb-best')) || 0; } catch { /* storage unavailable */ }

function setState(s: State) {
  state = s; dirty = true;
  overlay.classList.toggle('hidden', s === 'play');
  if (s === 'ready') { ovTitle.textContent = 'PILLOWS BLAST'; ovSub.textContent = 'PRESS ENTER OR TAP'; ovBtn.textContent = 'START'; }
  if (s === 'paused') { ovTitle.textContent = 'PAUSED'; ovSub.textContent = 'ENTER OR TAP TO RESUME'; ovBtn.textContent = 'RESUME'; }
  if (s === 'over') {
    if (g.score > best) { best = g.score; try { localStorage.setItem('pb-best', String(best)); } catch { /* ignore */ } }
    ovTitle.textContent = 'GAME OVER'; ovSub.innerHTML = `SCORE ${g.score}<br>BEST ${best}`; ovBtn.textContent = 'AGAIN';
    overAt = performance.now();
  }
}

function begin() {
  if (state === 'over') { if (performance.now() - overAt < OVER_LOCKOUT_MS) return; g.reset(); }
  if (state === 'ready') g.reset();
  down.clear();
  setState('play');
}

// ---- rendering ----
function block(ctx: CanvasRenderingContext2D, t: number, x: number, y: number, size: number, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(skins[t % 2], x, y, size, size);
  ctx.globalAlpha = 1;
}

function drawMini(ctx: CanvasRenderingContext2D, t: number) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  if (t < 0) return;
  const s = SHAPES[t][0], sz = 48;
  const minX = Math.min(...s.map((p) => p[0])), minY = Math.min(...s.map((p) => p[1]));
  const w = Math.max(...s.map((p) => p[0])) - minX + 1, h = Math.max(...s.map((p) => p[1])) - minY + 1;
  for (const [x, y] of s) block(ctx, t, (W - w * sz) / 2 + (x - minX) * sz, (H - h * sz) / 2 + (y - minY) * sz, sz);
}

let shownHold = -2, shownNext = -2, shownScore = -1, shownLevel = -1;

function draw() {
  board.clearRect(0, 0, COLS * CELL, (ROWS - HIDDEN) * CELL);
  for (let r = HIDDEN; r < ROWS; r++) {
    if (g.clearing.includes(r)) continue; // the splash replaces these rows
    for (let c = 0; c < COLS; c++) {
      const v = g.grid[r * COLS + c];
      if (v) block(board, v - 1, c * CELL, (r - HIDDEN) * CELL, CELL);
    }
  }
  if (g.clearing.length) {
    const p = clearT / CLEAR_MS, w = COLS * CELL, h = (w * splash.naturalHeight) / splash.naturalWidth;
    board.globalAlpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4; // hold, then fade
    for (const r of g.clearing) board.drawImage(splash, 0, (r - HIDDEN + 0.5) * CELL - h / 2, w, h);
    board.globalAlpha = 1;
  } else if (state !== 'ready' && !g.over) {
    const gy = g.ghostY(), cells = SHAPES[g.type][g.rot];
    for (const [cx, cy] of cells) if (gy + cy >= HIDDEN) block(board, g.type, (g.x + cx) * CELL, (gy + cy - HIDDEN) * CELL, CELL, 0.3);
    for (const [cx, cy] of cells) if (g.y + cy >= HIDDEN) block(board, g.type, (g.x + cx) * CELL, (g.y + cy - HIDDEN) * CELL, CELL);
  }
  if (g.held !== shownHold) drawMini(holdCtx, (shownHold = g.held));
  if (g.next !== shownNext) drawMini(nextCtx, (shownNext = g.next));
  if (g.score !== shownScore) scoreEl.textContent = String((shownScore = g.score));
  if (g.level !== shownLevel) levelEl.textContent = String((shownLevel = g.level));
}

// ---- input (keyboard + touch pad share one path) ----
const down = new Set<Action>();
let lastDir = 0, das = 0;

function press(a: Action) {
  if (state !== 'play') { if (a === 'pause' || a === 'cw' || a === 'drop') begin(); return; }
  switch (a) {
    case 'left': case 'right': down.add(a); lastDir = a === 'left' ? -1 : 1; das = 0; g.move(lastDir); break;
    case 'down': down.add(a); break;
    case 'cw': g.rotate(1); break;
    case 'ccw': g.rotate(-1); break;
    case 'hold': g.hold(); break;
    case 'drop': g.hardDrop(); break;
    case 'pause': down.clear(); setState('paused'); break;
  }
}

const KEYS: Record<string, Action> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'cw', x: 'cw', X: 'cw',
  z: 'ccw', Z: 'ccw', ' ': 'drop', c: 'hold', C: 'hold', Shift: 'hold', p: 'pause', P: 'pause', Escape: 'pause', Enter: 'pause',
};
addEventListener('keydown', (e) => {
  const a = KEYS[e.key];
  if (!a) return;
  e.preventDefault();
  if (!e.repeat) press(a);
});
addEventListener('keyup', (e) => { const a = KEYS[e.key]; if (a) down.delete(a); });

document.querySelectorAll<HTMLElement>('[data-a]').forEach((el) => {
  const a = el.dataset.a as Action;
  const up = () => { el.classList.remove('on'); down.delete(a); };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('on');
    if (e.pointerType === 'touch') navigator.vibrate?.(8);
    press(a);
  });
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
});
$('base').addEventListener('contextmenu', (e) => e.preventDefault());
ovBtn.addEventListener('click', () => { begin(); ovBtn.blur(); });

const autoPause = () => { if (state === 'play') press('pause'); };
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
addEventListener('blur', autoPause);

// ---- loop ----
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(now - last, 50);
  last = now;
  if (state === 'play') {
    if (g.clearing.length) {
      clearT += dt;
      if (clearT >= CLEAR_MS) { g.finishClear(); clearT = 0; }
    } else {
      const l = down.has('left'), r = down.has('right');
      const dir = l && r ? lastDir : l ? -1 : r ? 1 : 0;
      if (dir) { das += dt; while (das >= DAS) { das -= ARR; g.move(dir); } } else das = 0;
      g.tick(dt, down.has('down'));
    }
    if (g.over) setState('over');
    dirty = true;
  }
  if (dirty) { draw(); dirty = false; }
  requestAnimationFrame(frame);
}

Promise.all([...skins, splash].map((i) => i.decode())).then(() => {
  setState('ready');
  requestAnimationFrame(frame);
});
