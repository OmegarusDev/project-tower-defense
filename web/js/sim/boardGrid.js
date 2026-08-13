/** Exit distance fields — ground + air. Soft tower-avoid + per-enemy tie-split. */

export const INF = 1_000_000;
const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** Soft cost radius around towers (orthogonal steps). */
const TOWER_PROX_RADIUS = 2;

export class BoardGrid {
  constructor() {
    this.cols = 11;
    this.rows = 14;
    this.spawn = { x: 5, y: 0 };
    /** Representative exit cell (center of bottom home line) for legacy callers. */
    this.exit = { x: 5, y: 13 };
    this.blocked = [];
    /** Tower cells only — soft avoid field; walls are blocked but not "tower prox". */
    this.towerMask = [];
    this.groundDist = [];
    this.airDist = [];
    this.towerProx = [];
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
    this.towerMask = new Uint8Array(n);
    this._alloc(n);
    this.recompute();
  }

  _alloc(n) {
    this.groundDist = new Int32Array(n).fill(INF);
    this.airDist = new Int32Array(n).fill(INF);
    this.towerProx = new Int16Array(n);
    this.forkTicks = new Uint8Array(n);
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
    // Seam row (back line) is portal territory — never buildable
    if (y === 0) return false;
    if (this.isSpawn(x, y) || this.isExit(x, y)) return false;
    return !this.isBlocked(x, y);
  }

  setBlocked(x, y, value) {
    if (!this.inBounds(x, y)) return;
    this.blocked[this.idx(x, y)] = value ? 1 : 0;
  }

  /** Mark / clear a tower cell for soft path avoidance (call on place/sell). */
  setTower(x, y, value) {
    if (!this.inBounds(x, y)) return;
    this.towerMask[this.idx(x, y)] = value ? 1 : 0;
  }

  growSouth(extra) {
    if (extra <= 0) return;
    const oldRows = this.rows;
    const old = this.blocked;
    const oldTowers = this.towerMask;
    this.rows += extra;
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.towerMask = new Uint8Array(n);
    for (let y = 0; y < oldRows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const oi = y * this.cols + x;
        this.blocked[oi] = old[oi];
        this.towerMask[oi] = oldTowers[oi];
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
    this._rebuildTowerProx();
  }

  /** Soft cost near towers — precomputed on place/sell, not per-enemy BFS. */
  _rebuildTowerProx() {
    const n = this.cols * this.rows;
    this.towerProx.fill(0);
    const dist = new Int32Array(n).fill(INF);
    const q = [];
    for (let i = 0; i < n; i++) {
      if (!this.towerMask[i]) continue;
      dist[i] = 0;
      q.push(i % this.cols, (i / this.cols) | 0);
    }
    if (!q.length) return;
    let head = 0;
    while (head < q.length) {
      const x = q[head++];
      const y = q[head++];
      const cd = dist[this.idx(x, y)];
      if (cd >= TOWER_PROX_RADIUS) continue;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (dist[ni] <= cd + 1) continue;
        dist[ni] = cd + 1;
        q.push(nx, ny);
      }
    }
    for (let i = 0; i < n; i++) {
      const d = dist[i];
      if (d >= INF || d > TOWER_PROX_RADIUS) continue;
      // Higher cost closer to towers (tower cell itself unused by walkers).
      this.towerProx[i] = TOWER_PROX_RADIUS - d + 1;
    }
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
        // Canonical viz path: DIR-order first among min-dist neighbors (no avoid / no hash).
        nextArr[i] = this._pickAmong(x, y, dist, flying, {
          avoidTowers: false,
          id: 0,
          tick: 0,
        });
      }
    }
  }

  /**
   * Deterministic fair pick among equal-cost options.
   * Hash mixes enemy id + cell + tick so traffic forks evenly over time.
   */
  static pathTieHash(id, x, y, tick) {
    let h = ((id | 0) * 374761393) ^ ((x | 0) * 668265263) ^ ((y | 0) * 2147483647) ^ ((tick | 0) * 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return h >>> 0;
  }

  /**
   * Collect downhill neighbors at the minimum groundDist, optionally prefer
   * lower towerProx. Live enemy picks (pickNextGround) alternate branches with
   * a per-cell round-robin counter — the next enemy through the cell takes the
   * next branch, and a mid-glide re-pick always returns the same branch (no
   * tick-dependent hash, which made enemies jitter forever at forks). The
   * canonical viz path (_bfs) keeps DIR-order first via the static hash.
   */
  _pickAmong(x, y, dist, flying, { avoidTowers = true, id = 0, tick = 0, live = false, entity = null } = {}) {
    const cur = dist[this.idx(x, y)];
    let bestD = INF;
    const cands = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      if (!flying && this.isBlocked(nx, ny)) continue;
      const nd = dist[this.idx(nx, ny)];
      if (nd >= INF) continue;
      if (nd > bestD) continue;
      if (nd < bestD) {
        bestD = nd;
        cands.length = 0;
      }
      cands.push({ x: nx, y: ny });
    }
    if (!cands.length || bestD >= cur) return { x, y };

    let pool = cands;
    if (avoidTowers && this.towerProx) {
      let bestProx = INF;
      const filtered = [];
      for (const c of cands) {
        const p = this.towerProx[this.idx(c.x, c.y)] | 0;
        if (p > bestProx) continue;
        if (p < bestProx) {
          bestProx = p;
          filtered.length = 0;
        }
        filtered.push(c);
      }
      if (filtered.length) pool = filtered;
    }

    if (pool.length === 1) return pool[0];
    if (live) {
      // Stable per (enemy, cell): the first enemy through the fork takes the
      // next branch (round-robin), and mid-glide re-picks return the stored
      // branch — no tick-dependent re-roll, so enemies never jitter at forks.
      const stored =
        entity &&
        entity._pick &&
        entity._pick.cx === x &&
        entity._pick.cy === y;
      if (
        stored &&
        pool.some((c) => c.x === entity._pick.bx && c.y === entity._pick.by)
      ) {
        return { x: entity._pick.bx, y: entity._pick.by };
      }
      const k = this.idx(x, y);
      const h = this.forkTicks[k] || 0;
      this.forkTicks[k] = (h + 1) % pool.length;
      const branch = pool[h];
      if (entity) entity._pick = { cx: x, cy: y, bx: branch.x, by: branch.y };
      return branch;
    }
    const h = BoardGrid.pathTieHash(id, x, y, tick);
    return pool[h % pool.length];
  }

  /** Viz / legacy: precomputed DIR-order next without per-enemy avoid. */
  nextGround(x, y) {
    if (!this.inBounds(x, y)) return { x, y };
    return this.groundNext[this.idx(x, y)];
  }

  nextAir(x, y) {
    if (!this.inBounds(x, y)) return { x, y };
    return this.airNext[this.idx(x, y)];
  }

  /**
   * Per-enemy ground step: shortest exit distance, soft tower avoid, fair ties.
   * @param {{ id?: number, tick?: number, avoidTowers?: boolean }} [opts]
   */
  pickNextGround(x, y, opts = {}) {
    if (!this.inBounds(x, y)) return { x, y };
    if (this.isExit(x, y)) return { x, y };
    return this._pickAmong(x, y, this.groundDist, false, {
      avoidTowers: opts.avoidTowers !== false,
      id: opts.id | 0,
      tick: opts.tick | 0,
      live: true,
      entity: opts.entity || null,
    });
  }

  groundDistance(x, y) {
    if (!this.inBounds(x, y)) return INF;
    return this.groundDist[this.idx(x, y)];
  }

  towerProximity(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.towerProx[this.idx(x, y)] | 0;
  }

  exportBlocked() {
    return Array.from(this.blocked);
  }
}
