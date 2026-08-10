/**
 * Forgeworks — future-industrial iron deck.
 * Cool steel plates, copper/ember trim, dirty & worn but sleek.
 */
export class ProcPalette {
  constructor() {
    this.colorblind = false;
    // Field — dark iron deck (low checker contrast)
    this.bg = "#14181e";
    this.void = "#0a0c10";
    this.tileA = "#1c222a";
    this.tileB = "#1a2028";
    this.tileEdge = "#2e3742";
    this.tileSeam = "#0f1318";
    this.tileMetal = "#3a4552";
    this.grid = "rgba(70, 82, 96, 0.55)";
    this.path = "#7a8a9a";
    this.pathInk = "#1a222c";
    // Barricades — bright industrial steel so they read against the deck
    this.wall = "#9aa6b4";
    this.wallDark = "#4a5564";
    this.wallTrim = "#d4783a";
    this.spawn = "#5aaf8a";
    this.exit = "#c45a4a";
    this.accent = "#d4783a";
    this.text = "#e8e4dc";
    this.fog = "rgba(8, 10, 14, 0.58)";
    this.damage = {
      kinetic: "#d8d2c4",
      fire: "#e07a3a",
      shock: "#e6c84a",
      frost: "#7eb8c9",
      poison: "#9a6bb8",
      acid: "#7aad5c",
    };
    // Enamel / lacquer base coats on steel mounts
    this.base = {
      sentry: "#4f7eb0",
      bulwark: "#6d746c",
      spire: "#c4783a",
      aerie: "#7a5a9a",
      warden: "#3d9a8e",
      talon: "#b86448",
    };
    // Worked metal barrels
    this.barrel = {
      single: "#9aa6b0",
      twin: "#8a96a0",
      scatter: "#b89968",
      rail: "#6a7680",
      pulse: "#6a9080",
      launcher: "#c4843e",
    };
    this.payload = {
      kinetic: "#d8d2c4",
      pyro: "#e07a3a",
      shock: "#e6c84a",
      frost: "#7eb8c9",
      poison: "#9a6bb8",
      acid: "#7aad5c",
    };
    this.enemy = {
      grub: "#b84a55",
      runner: "#d4892a",
      plate: "#6a7480",
      skiff: "#6b5a9a",
      aegis: "#5a8ab0",
      cluster: "#a06070",
      wraith: "#8a7ab8",
      furnace: "#c4683a",
      leech: "#8a4060",
      overlord: "#c4305a",
      // legacy aliases
      basic: "#b84a55",
      heavy: "#6a7480",
      fast: "#d4892a",
      flying: "#6b5a9a",
      shielded: "#5a8ab0",
      splitter: "#a06070",
      boss: "#c4305a",
    };
  }

  setColorblind(on) {
    this.colorblind = !!on;
  }

  c(hex) {
    if (!this.colorblind) return hex;
    if (typeof hex === "string" && hex.startsWith("rgba")) return hex;
    return hex;
  }

  dmg(type) {
    return this.c(this.damage[type] || this.damage.kinetic);
  }

  baseColor(id) {
    return this.c(this.base[id] || this.accent);
  }

  barrelColor(id) {
    return this.c(this.barrel[id] || this.barrel.single);
  }

  payloadColor(id) {
    return this.c(this.payload[id] || this.payload.kinetic);
  }

  enemyColor(kind) {
    return this.c(this.enemy[kind] || this.enemy.basic);
  }
}
