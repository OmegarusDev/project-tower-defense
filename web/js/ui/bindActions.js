/** data-act dispatch — the table lives in ui/next/actions.js. */
import { runAction } from "./next/actions.js";

export function handleUiAction(app, act, _ev) {
  runAction(app, act);
}
