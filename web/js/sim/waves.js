export class WaveManager {
  constructor(world) {
    this.world = world;
    this.spawnTimer = 0;
    this.toSpawn = 0;
    this.waveActive = false;
  }

  startNextWave() {
    this.world.waveIndex += 1;
    const w = this.world.waveIndex;
    this.toSpawn = Math.floor(8 * Math.pow(1.12, w - 1));
    this.spawnTimer = 0.15;
    this.waveActive = true;
    this.world.emit("wave_checkpoint", { wave: w });
    this.world.emit("wave_composition", { count: this.toSpawn, wave: w });
  }

  tick() {
    if (!this.waveActive) return;
    if (this.toSpawn > 0) {
      this.spawnTimer -= this.world.dt;
      if (this.spawnTimer <= 0) {
        this._spawnOne();
        this.toSpawn -= 1;
        this.spawnTimer = Math.max(0.25, 1.0 * Math.pow(0.97, this.world.waveIndex - 1));
      }
    } else if (this.world.enemies.length === 0) {
      this.waveActive = false;
      const wave = this.world.waveIndex;
      const rewards = this.world.economy.applyWaveClear(wave);
      this.world.emit("wave_cleared", { wave, ...rewards });
      if (
        !this.world.modeEndless &&
        this.world.wavesToWin > 0 &&
        wave >= this.world.wavesToWin
      ) {
        this.world.running = false;
        this.world.emit("victory", { wave, levelId: this.world.campaignLevelId });
        return;
      }
      if (this.world.modeEndless && wave % 20 === 0 && wave <= 100) {
        if (this.world.grid.rows < 28) this.world.growSouth(2);
      }
    }
  }

  _spawnOne() {
    const w = this.world.waveIndex;
    const roll = Math.random();
    let kind = "basic";
    if (w >= 6 && roll < 0.12) kind = "flying";
    else if (w >= 4 && roll < 0.25) kind = "heavy";
    else if (w >= 3 && roll < 0.4) kind = "fast";
    const e = this._make(kind, w);
    this.world.enemies.push(e);
    this.world.emit("enemy_spawned", { enemy: e });
  }

  _make(kind, wave) {
    const scale = Math.pow(1.05, wave - 1);
    const spawn = this.world.grid.spawn;
    const e = {
      id: this.world.allocId(),
      kind,
      cell: { x: spawn.x, y: spawn.y },
      pos: { x: spawn.x + 0.5, y: spawn.y + 0.5 },
      hp: 28 * scale,
      maxHp: 28 * scale,
      speed: 0.85,
      flying: false,
      leakDamage: 1,
      battleDrop: 2,
      armorFlat: 0,
      resist: {},
      immune: [],
      reachedExit: false,
    };
    if (kind === "heavy") {
      e.hp = e.maxHp = 70 * scale;
      e.speed = 0.45;
      e.leakDamage = 2;
      e.battleDrop = 3;
      e.armorFlat = 2;
    } else if (kind === "fast") {
      e.hp = e.maxHp = 16 * scale;
      e.speed = 1.45;
      e.battleDrop = 2;
    } else if (kind === "flying") {
      e.flying = true;
      e.hp = e.maxHp = 20 * scale;
      e.speed = 1.0;
      e.battleDrop = 2;
    }
    return e;
  }
}
