/** Exit distance fields — ground + air. No per-enemy A*. */

export const INF = 1_000_000;
const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

export class BoardGrid {
  constructor() {
    this.cols = 11;
    this.rows = 14;
    this.spawn = { x: 5, y: 0 };
    /** Representative exit cell (center of bottom home line) for legacy callers. */
    this.exit = { x: 5, y: 13 };
    this.blocked = [];
    this.groundDist = [];
    this.airDist = [];
    this.groundNext = [];
    this.airNext = [];
  }

  setup(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.spawn = { x: (cols / 2) | 0, y: 0 };
    this.exit = { x: (cols / 2) | 0, y: rows - 1 };
    const n = cols * rows;
    this.blocked = new Uint8Array(n);
    this._alloc(n);
    this.recompute();
  }

  _alloc(n) {
    this.groundDist = new Int32Array(n).fill(INF);
    this.airDist = new Int32Array(n).fill(INF);
    this.groundNext = new Array(n);
    this.airNext = new Array(n);
    for (let i = 0; i < n; i++) {
      this.groundNext[i] = { x: i % this.cols, y: (i / this.cols) | 0 };
      this.airNext[i] = { x: i % this.cols, y: (i / this.cols) | 0 };
    }
  }

  idx(x, y) {
    return y * this.cols + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /** Entire bottom row is the defended home line. */
  isExit(x, y) {
    return this.inBounds(x, y) && y === this.rows - 1;
  }

  isSpawn(x, y) {
    return this.inBounds(x, y) && x === this.spawn.x && y === this.spawn.y;
  }

  isBlocked(x, y) {
    if (!this.inBounds(x, y)) return true;
    return this.blocked[this.idx(x, y)] !== 0;
  }

  isBuildable(x, y) {
    if (!this.inBounds(x, y)) return false;
    if (this.isSpawn(x, y) || this.isExit(x, y)) return false;
    return !this.isBlocked(x, y);
  }

  setBlocked(x, y, value) {
    if (!this.inBounds(x, y)) return;
    this.blocked[this.idx(x, y)] = value ? 1 : 0;
  }

  growSouth(extra) {
    if (extra <= 0) return;
    const oldRows = this.rows;
    const old = this.blocked;
    this.rows += extra;
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    for (let y = 0; y < oldRows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.blocked[y * this.cols + x] = old[y * this.cols + x];
      }
    }
    this.exit = { x: (this.cols / 2) | 0, y: this.rows - 1 };
    this._alloc(n);
    this.recompute();
  }

  hasGroundPath() {
    this.recompute();
    return this.groundDist[this.idx(this.spawn.x, this.spawn.y)] < INF;
  }

  recompute() {
    this._bfs(false, this.groundDist, this.groundNext);
    this._bfs(true, this.airDist, this.airNext);
  }

  _bfs(flying, dist, nextArr) {
    const n = this.cols * this.rows;
    dist.fill(INF);
    for (let i = 0; i < n; i++) {
      nextArr[i] = { x: i % this.cols, y: (i / this.cols) | 0 };
    }
    const q = [];
    // Seed every home-line cell
    for (let x = 0; x < this.cols; x++) {
      const y = this.rows - 1;
      const ei = this.idx(x, y);
      dist[ei] = 0;
      q.push(x, y);
    }
    let head = 0;
    while (head < q.length) {
      const x = q[head++];
      const y = q[head++];
      const cd = dist[this.idx(x, y)];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (!flying && this.isBlocked(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (dist[ni] <= cd + 1) continue;
        dist[ni] = cd + 1;
        q.push(nx, ny);
      }
    }
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = this.idx(x, y);
        if (dist[i] >= INF || this.isExit(x, y)) {
          nextArr[i] = { x, y };
          continue;
        }
        let best = { x, y };
        let bestD = dist[i];
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          if (!flying && this.isBlocked(nx, ny)) continue;
          const nd = dist[this.idx(nx, ny)];
          if (nd < bestD) {
            bestD = nd;
            best = { x: nx, y: ny };
          }
        }
        nextArr[i] = best;
      }
    }
  }

  nextGround(x, y) {
    if (!this.inBounds(x, y)) return { x, y };
    return this.groundNext[this.idx(x, y)];
  }

  nextAir(x, y) {
    if (!this.inBounds(x, y)) return { x, y };
    return this.airNext[this.idx(x, y)];
  }

  groundDistance(x, y) {
    if (!this.inBounds(x, y)) return INF;
    return this.groundDist[this.idx(x, y)];
  }

  exportBlocked() {
    return Array.from(this.blocked);
  }
}
