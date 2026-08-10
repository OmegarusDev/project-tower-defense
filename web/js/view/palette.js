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
      flak: "#b8a878",
    };
    this.payload = {
      kinetic: "#d8d2c4",
      pyro: "#e07a3a",
      shock: "#e6c84a",
      frost: "#7eb8c9",
      poison: "#9a6bb8",
      acid: "#7aad5c",
      breach: "#c8b090",
      emp: "#7ec8e8",
    };
    this.enemy = {
      mite: "#b84a55",
      courier: "#d4892a",
      hauler: "#6a7480",
      hauler_ceramite: "#8a9088",
      duct: "#6b5a9a",
      ward: "#5a8ab0",
      ward_volt: "#6ab0c8",
      cask: "#a06070",
      phantom: "#8a7ab8",
      kiln: "#c4683a",
      siphon: "#8a4060",
      claim: "#c4305a",
      // legacy aliases
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
      basic: "#b84a55",
      heavy: "#6a7480",
      fast: "#d4892a",
      flying: "#6b5a9a",
      shielded: "#5a8ab0",
      splitter: "#a06070",
      boss: "#c4305a",
    };
    this.atmosphere = {
      fog: this.fog,
      moteWarm: this.accent,
      moteCool: "#9eb0c0",
      bloom: 0.35,
      pulse: this.accent,
    };
    this._atmosphereId = "default";
  }

  setColorblind(on) {
    this.colorblind = !!on;
  }

  /** Soft deck/fog variants for campaign levels and endless themes. */
  setAtmosphere(id) {
    const key = id || "default";
    this._atmosphereId = key;
    const table = {
      default: {
        fog: "rgba(8, 10, 14, 0.58)",
        moteWarm: "#d4783a",
        moteCool: "#9eb0c0",
        bloom: 0.35,
        pulse: "#d4783a",
      },
      campaign_1: {
        fog: "rgba(10, 14, 20, 0.55)",
        moteWarm: "#7a9ab0",
        moteCool: "#9eb0c0",
        bloom: 0.4,
        pulse: "#6a8a9a",
      },
      campaign_2: {
        fog: "rgba(12, 12, 18, 0.58)",
        moteWarm: "#d4892a",
        moteCool: "#a0a8b8",
        bloom: 0.32,
        pulse: "#d4892a",
      },
      campaign_3: {
        fog: "rgba(10, 12, 16, 0.6)",
        moteWarm: "#8a6a9a",
        moteCool: "#7a90a8",
        bloom: 0.36,
        pulse: "#8a6a9a",
      },
      campaign_4: {
        fog: "rgba(18, 10, 8, 0.58)",
        moteWarm: "#e07a3a",
        moteCool: "#a08070",
        bloom: 0.28,
        pulse: "#e07a3a",
      },
      campaign_5: {
        fog: "rgba(14, 10, 8, 0.62)",
        moteWarm: "#c9a227",
        moteCool: "#b09070",
        bloom: 0.3,
        pulse: "#c9a227",
      },
      campaign_6: {
        fog: "rgba(8, 16, 18, 0.6)",
        moteWarm: "#5aaf8a",
        moteCool: "#7a9ab0",
        bloom: 0.38,
        pulse: "#5aaf8a",
      },
      campaign_7: {
        fog: "rgba(16, 8, 14, 0.62)",
        moteWarm: "#c4305a",
        moteCool: "#8a6a9a",
        bloom: 0.28,
        pulse: "#c4305a",
      },
      mites: {
        fog: "rgba(8, 10, 14, 0.55)",
        moteWarm: "#b84a55",
        moteCool: "#9eb0c0",
        bloom: 0.34,
        pulse: "#b84a55",
      },
      rush: {
        fog: "rgba(14, 12, 8, 0.52)",
        moteWarm: "#d4892a",
        moteCool: "#c0a878",
        bloom: 0.3,
        pulse: "#d4892a",
      },
      haulers: {
        fog: "rgba(10, 12, 16, 0.6)",
        moteWarm: "#8a96a0",
        moteCool: "#6a7480",
        bloom: 0.36,
        pulse: "#8a96a0",
      },
      ducts: {
        fog: "rgba(12, 10, 22, 0.55)",
        moteWarm: "#8a7ab8",
        moteCool: "#6b5a9a",
        bloom: 0.42,
        pulse: "#8a7ab8",
      },
      breach: {
        fog: "rgba(16, 10, 12, 0.58)",
        moteWarm: "#a06070",
        moteCool: "#9eb0c0",
        bloom: 0.33,
        pulse: "#a06070",
      },
      foundry: {
        fog: "rgba(20, 10, 6, 0.6)",
        moteWarm: "#e07a3a",
        moteCool: "#a07050",
        bloom: 0.26,
        pulse: "#e07a3a",
      },
      ceramite: {
        fog: "rgba(12, 14, 16, 0.62)",
        moteWarm: "#9aa898",
        moteCool: "#6a7480",
        bloom: 0.34,
        pulse: "#9aa898",
      },
      volt: {
        fog: "rgba(10, 14, 22, 0.6)",
        moteWarm: "#6ab0c8",
        moteCool: "#5a8ab0",
        bloom: 0.4,
        pulse: "#6ab0c8",
      },
      chaos: {
        fog: "rgba(14, 8, 16, 0.62)",
        moteWarm: "#c9a227",
        moteCool: "#9a6bb8",
        bloom: 0.3,
        pulse: "#c4305a",
      },
      sky_breach: {
        fog: "rgba(14, 12, 28, 0.58)",
        moteWarm: "#a090d0",
        moteCool: "#6b5a9a",
        bloom: 0.45,
        pulse: "#a090d0",
      },
      foundry_night: {
        fog: "rgba(22, 8, 4, 0.64)",
        moteWarm: "#ff8a40",
        moteCool: "#805040",
        bloom: 0.22,
        pulse: "#ff8a40",
      },
      ceramite_front: {
        fog: "rgba(12, 14, 16, 0.64)",
        moteWarm: "#a8b0a0",
        moteCool: "#708078",
        bloom: 0.32,
        pulse: "#a8b0a0",
      },
    };
    this.atmosphere = table[key] || table[key.replace(/^event_/, "")] || table.default;
    this.fog = this.atmosphere.fog;
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
    return this.c(this.enemy[kind] || this.enemy.mite || this.enemy.basic);
  }
}
