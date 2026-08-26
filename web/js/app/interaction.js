/**
 * Interaction / selection state for the live game.
 *
 * Previously these fields lived directly on the App instance, scattering the
 * game's "what is the player doing right now" state across app.js + every
 * delegate (place/input/chrome/...). They now live in one object, created here.
 *
 * App re-exposes them as thin getters/setters (see app.js) so delegate code
 * keeps calling `app.tool` / `app.selectedTowerId` unchanged — the state is
 * extracted without touching every call site.
 */
export function createInteraction() {
  return {
    tool: "tower", // "tower" | "wall"
    slot: -1, // selected build slot index
    selectedTowerId: -1, // currently selected placed tower
    selectedWallId: -1, // currently selected placed wall
    placeConfirm: null, // pending tower placement confirm {x,y,...}
    liveCompose: false, // live-compose mode active
    undoStack: [], // placement undo history
    _handSlot: null, // slot index currently "in hand", null = empty
    slotPreviewAim: 0, // rotating preview angle
  };
}
