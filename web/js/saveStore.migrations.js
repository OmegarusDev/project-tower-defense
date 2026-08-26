// Forward-migrations for persisted save kinds.
//
// This is the ONE import surface for every save migration. The migration logic
// for each kind lives beside its data (part-id maps in data/parts.js, tech-rank
// mapping in data/techTree.js) because each is tightly coupled to that domain's
// graph; this module is where they are all reached from, while the shape +
// version contract itself lives in saveStore.js.

export { migratePartId } from "./data/parts.js";
export { migrateTechRanks } from "./data/techTree.js";
