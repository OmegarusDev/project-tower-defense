/** Wave-in-progress: live spawn queue or enemies still on the board. */
export function waveBusy(app) {
  const s = app.sim?.state;
  return !!(s && (s.waves.active || s.enemies.length));
}
