import { BoardGrid } from "../sim/boardGrid.js";
import { mulberry32 } from "../sim/rng.js";

const EDITOR_KEY = "ptd_editor_levels_v1";

export function loadEditorLevels() {
  try {
    const raw = JSON.parse(localStorage.getItem(EDITOR_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

export function saveEditorLevels(list) {
  localStorage.setItem(EDITOR_KEY, JSON.stringify(list.slice(0, 24)));
}

/** Minimal local level editor state machine. */
export class LevelEditor {
  constructor() {
    this.cols = 8;
    this.rows = 8;
    this.walls = [];
    this.name = "Custom Yard";
    this.wavesToWin = 5;
    this.coinGrant = 50;
    this.waveScript = "mixed_mid";
    this.paint = "wall";
    this.grid = new BoardGrid();
    this.grid.setup(this.cols, this.rows);
  }

  resize(cols, rows) {
    this.cols = Math.max(6, Math.min(12, cols | 0));
    this.rows = Math.max(6, Math.min(16, rows | 0));
    this.walls = this.walls.filter((w) => w.x < this.cols && w.y < this.rows && w.y > 0 && w.y < this.rows - 1);
    this.grid.setup(this.cols, this.rows);
    for (const w of this.walls) this.grid.setBlocked(w.x, w.y, true);
    this.grid.recompute();
  }

  toggle(x, y) {
    if (y <= 0 || y >= this.rows - 1) return false;
    if (x === this.grid.spawn.x && y === this.grid.spawn.y) return false;
    if (x === this.grid.exit.x && y === this.grid.exit.y) return false;
    const i = this.walls.findIndex((w) => w.x === x && w.y === y);
    if (i >= 0) {
      this.walls.splice(i, 1);
      this.grid.setBlocked(x, y, false);
      this.grid.recompute();
      return true;
    }
    this.grid.setBlocked(x, y, true);
    if (!this.grid.hasGroundPath()) {
      this.grid.setBlocked(x, y, false);
      this.grid.recompute();
      return false;
    }
    this.walls.push({ x, y });
    return true;
  }

  randomize(count = 8) {
    const rand = mulberry32((Date.now() ^ 0xabc) >>> 0);
    this.walls = [];
    this.grid.setup(this.cols, this.rows);
    let attempts = 0;
    while (this.walls.length < count && attempts < 600) {
      attempts++;
      const x = (rand() * this.cols) | 0;
      const y = (rand() * this.rows) | 0;
      if (y === 0 || y === this.rows - 1) continue;
      if (!this.grid.isBuildable(x, y)) continue;
      this.grid.setBlocked(x, y, true);
      if (!this.grid.hasGroundPath()) {
        this.grid.setBlocked(x, y, false);
        continue;
      }
      this.walls.push({ x, y });
    }
  }

  toLevelDef() {
    return {
      id: `custom_${Date.now()}`,
      name: this.name || "Custom",
      blurb: "Editor level",
      cols: this.cols,
      rows: this.rows,
      seed: (Date.now() & 0xffff) | 0,
      wallCount: this.walls.length,
      wavesToWin: this.wavesToWin | 0 || 5,
      coinGrant: this.coinGrant | 0 || 50,
      waves: Array.from({ length: this.wavesToWin | 0 || 5 }, () => ({
        pack: this.waveScript || "mixed_mid",
        spawnGap: 0.4,
      })),
      preWalls: this.walls.map((w) => ({ x: w.x, y: w.y })),
      custom: true,
    };
  }

  saveNamed() {
    const list = loadEditorLevels();
    const def = this.toLevelDef();
    list.unshift(def);
    saveEditorLevels(list);
    return def;
  }
}
