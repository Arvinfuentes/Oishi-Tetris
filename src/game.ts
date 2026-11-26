export const COLS = 10, ROWS = 22, HIDDEN = 2;
type P = [number, number];

// I O T S Z J L, spawn orientation. SIZE = rotation box.
const BASE: P[][] = [
  [[0,1],[1,1],[2,1],[3,1]], [[0,0],[1,0],[0,1],[1,1]], [[1,0],[0,1],[1,1],[2,1]],
  [[1,0],[2,0],[0,1],[1,1]], [[0,0],[1,0],[1,1],[2,1]], [[0,0],[0,1],[1,1],[2,1]], [[2,0],[0,1],[1,1],[2,1]],
];
const SIZE = [4, 2, 3, 3, 3, 3, 3];
export const SHAPES: P[][][] = BASE.map((c, t) => {
  const out = [c];
  for (let r = 1; r < 4; r++) out.push(out[r - 1].map(([x, y]): P => [SIZE[t] - 1 - y, x]));
  return out;
});

// SRS wall kicks (clockwise, y-up). CCW kicks are the negated table of the target rotation.
const KJ: P[][] = [
  [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  [[0,0],[1,0],[1,1],[0,-2],[1,-2]], [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
];
const KI: P[][] = [
  [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
];
const kicks = (t: number, r: number, d: number): P[] => {
  if (t === 1) return [[0, 0]];
  const k = t === 0 ? KI : KJ;
  return d > 0 ? k[r].map(([x, y]): P => [x, -y]) : k[(r + 3) % 4].map(([x, y]): P => [-x, y]);
};

const LOCK_MS = 500, SOFT_DROP_MS = 120, MAX_RESETS = 15, LINE_PTS = [0, 100, 300, 500, 800];

export class Game {
  grid = new Uint8Array(COLS * ROWS); // 0 empty, else piece type + 1
  type = 0; rot = 0; x = 0; y = 0;
  held = -1; next = 0; canHold = true;
  score = 0; lines = 0; level = 1; over = false;
  clearing: number[] = []; // full rows waiting for the clear animation
  private bag: number[] = [];
  private drop = 0; private lock = 0; private resets = 0;

  constructor() { this.reset(); }

  reset() {
    this.grid.fill(0); this.bag = []; this.held = -1;
    this.score = this.lines = 0; this.level = 1; this.over = false; this.clearing = [];
    this.next = this.pull(); this.spawn();
  }

  private pull(): number {
    if (!this.bag.length) {
      const b = [0, 1, 2, 3, 4, 5, 6];
      for (let i = 6; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; }
      this.bag = b;
    }
    return this.bag.pop()!;
  }

  private place(t: number) {
    this.type = t; this.rot = 0; this.x = t === 1 ? 4 : 3; this.y = 1;
    this.drop = this.lock = this.resets = 0;
    if (this.collides(t, 0, this.x, this.y)) this.over = true;
  }

  private spawn() { this.place(this.next); this.next = this.pull(); this.canHold = true; }

  collides(t: number, r: number, x: number, y: number): boolean {
    for (const [cx, cy] of SHAPES[t][r]) {
      const px = x + cx, py = y + cy;
      if (px < 0 || px >= COLS || py >= ROWS || (py >= 0 && this.grid[py * COLS + px])) return true;
    }
    return false;
  }

  private grounded() { return this.collides(this.type, this.rot, this.x, this.y + 1); }

  private touch() {
    if (this.grounded() && this.resets < MAX_RESETS) { this.lock = 0; this.resets++; }
  }

  move(dx: number) {
    if (this.over || this.clearing.length || this.collides(this.type, this.rot, this.x + dx, this.y)) return;
    this.x += dx; this.touch();
  }

  rotate(d: number) {
    if (this.over || this.clearing.length) return;
    const nr = (this.rot + d + 4) % 4;
    for (const [kx, ky] of kicks(this.type, this.rot, d)) {
      if (!this.collides(this.type, nr, this.x + kx, this.y + ky)) {
        this.rot = nr; this.x += kx; this.y += ky; this.touch(); return;
      }
    }
  }

  hold() {
    if (this.over || this.clearing.length || !this.canHold) return;
    const t = this.type;
    if (this.held < 0) { this.held = t; this.spawn(); }
    else { const h = this.held; this.held = t; this.place(h); }
    this.canHold = false;
  }

  hardDrop() {
    if (this.over || this.clearing.length) return;
    this.y = this.ghostY();
    this.lockPiece();
  }

  ghostY(): number {
    let gy = this.y;
    while (!this.collides(this.type, this.rot, this.x, gy + 1)) gy++;
    return gy;
  }

  private gravity() { return Math.pow(0.8 - (this.level - 1) * 0.007, this.level - 1) * 1000; }

  tick(dt: number, soft: boolean) {
    if (this.over || this.clearing.length) return;
    if (this.grounded()) {
      this.lock += dt;
      if (this.lock >= LOCK_MS) this.lockPiece();
      return;
    }
    this.lock = 0; this.drop += dt;
    const g = soft ? Math.max(this.gravity() / 10, SOFT_DROP_MS) : this.gravity();
    while (this.drop >= g && !this.grounded()) {
      this.drop -= g; this.y++; this.resets = 0;
    }
    if (this.grounded()) this.drop = 0;
  }

  private lockPiece() {
    for (const [cx, cy] of SHAPES[this.type][this.rot]) {
      const py = this.y + cy;
      if (py >= 0) this.grid[py * COLS + this.x + cx] = this.type + 1;
    }
    for (let r = 0; r < ROWS; r++) {
      let full = true;
      for (let c = 0; c < COLS; c++) if (!this.grid[r * COLS + c]) { full = false; break; }
      if (full) this.clearing.push(r);
    }
    if (!this.clearing.length) this.spawn();
  }

  /** Removes the rows queued in `clearing`, scores them, and spawns the next piece. */
  finishClear() {
    const n = this.clearing.length;
    for (const r of this.clearing) { this.grid.copyWithin(COLS, 0, r * COLS); this.grid.fill(0, 0, COLS); }
    this.clearing = [];
    this.score += LINE_PTS[n] * this.level; this.lines += n;
    this.level = 1 + ((this.lines / 10) | 0);
    this.spawn();
  }
}
