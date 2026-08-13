/**
 * Unified close button — every header's "back" is the same X chip.
 * The data-act target carries the CORRECT previous screen (screens record
 * where they were entered from: forge-from-hub -> hub, tech-from-prep ->
 * prep, etc.), so X always returns to where you came from — never blindly
 * to the main menu. The in-game pause sheet has its own quit handling.
 */
export function xClose(act) {
  return `<button type="button" class="x-close" data-act="${act}" aria-label="Close" title="Back">
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1.5 1.5 L10.5 10.5 M10.5 1.5 L1.5 10.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  </button>`;
}
