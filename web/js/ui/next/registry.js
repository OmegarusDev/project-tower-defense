/**
 * Screen registry — the meta screens as pure render fns keyed by screen id.
 * mountScreen writes the rendered HTML into the container and returns the
 * screen id (the caller owns screen bookkeeping + bind hooks).
 */
import {
  renderSplash,
  renderMain,
  renderSettings,
  renderCampaign,
  renderPrep,
  renderHub,
  renderForge,
  renderTech,
  renderEditor,
} from "./screens.js";

export const SCREENS = {
  splash: renderSplash,
  main: renderMain,
  settings: renderSettings,
  campaign: renderCampaign,
  prep: renderPrep,
  hub: renderHub,
  forge: renderForge,
  upgrade: renderTech,
  editor: renderEditor,
};

export function screenHtml(id, state) {
  const fn = SCREENS[id];
  if (!fn) return "";
  return fn(state);
}

/* Mulberry32 — fast seeded PRNG, returns [0,1) */
function _prng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* djb2 string hash — stable per-element seed so textures don't scramble on re-render */
function _hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/* Rough "badly-cut" silhouette — jittered chamfer corners + a dense jagged
   edge with occasional deep corrosion bites. Per element: every plate is
   cut differently and some are more eaten-away than others. */
const LARGE_RE =
  /(^|\s)(plate-frame|level-card|end-card|hub-card|prep-card|pause-card|compose-sheet|ttree-branch|forge-preview-wrap|ed-grid)(\s|$)/;

function _roughClip(rand, large) {
  const r = (lo, hi) => lo + rand() * (hi - lo);
  const f = (v) => { const s = v.toFixed(1); return s === "-0.0" ? "0.0" : s; };

  const amp = r(0.85, 1.5); // per-element roughness scale
  const devLo = large ? -3.0 : -2.2;
  const devHi = large ? 3.5 : 2.6;
  const gougeLo = large ? 3.0 : 2.0;
  const gougeHi = large ? 6.0 : 4.5;
  const chamferLo = large ? 6 : 2;
  const chamferHi = large ? 15 : 9;

  const dev = () => {
    let v = r(devLo, devHi) * amp;             // wavy edge, slightly inward-biased
    if (rand() < 0.15) v += r(gougeLo, gougeHi) * amp; // occasional deep corrosion bite
    return v;
  };
  const chamfer = () => r(chamferLo, chamferHi);

  // "100% minus v" without producing a `- -` double sign when v is negative
  const sub = (v) => {
    const x = f(v);
    return x.startsWith("-") ? `+ ${x.slice(1)}px` : `- ${x}px`;
  };

  const edge = (orient) => {
    const n = 5 + ((rand() * 3) | 0); // 5–7 points per edge
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + r(-0.35, 0.35)) / n;
      const pc = f(t * 100);
      const d = dev();
      const wob = f(r(-1.5, 1.5));
      if (orient === "top") pts.push(`calc(${pc}% + ${wob}px) ${f(d)}px`);
      else if (orient === "right") pts.push(`calc(100% ${sub(d)}) calc(${pc}% + ${wob}px)`);
      else if (orient === "bottom") pts.push(`calc(${pc}% + ${wob}px) calc(100% ${sub(d)})`);
      else pts.push(`${f(d)}px calc(${pc}% + ${wob}px)`);
    }
    return pts;
  };

  const ctl = chamfer(), ctr = chamfer(), cbr = chamfer(), cbl = chamfer();
  const p = [
    `0 ${f(ctl + r(-1, 1))}px`, `${f(ctl + r(-1, 1))}px 0`,
    ...edge("top"),
    `calc(100% - ${f(ctr + r(-1, 1))}px) 0`, `100% ${f(ctr + r(-1, 1))}px`,
    ...edge("right"),
    `100% calc(100% - ${f(cbr + r(-1, 1))}px)`, `calc(100% - ${f(cbr + r(-1, 1))}px) 100%`,
    ...edge("bottom"),
    `${f(cbl + r(-1, 1))}px 100%`, `0 calc(100% - ${f(cbl + r(-1, 1))}px)`,
    ...edge("left"),
  ];
  return `polygon(${p.join(", ")})`;
}

/* Every plated surface — buttons, tiles, chips, cards, panels, inputs. */
const ROUGH_SEL = [
  ".btn", ".slot-tile", ".wall-tile", ".call-btn", ".ttree-tab", ".x-close",
  ".chrome-fab", ".forge-arrow", ".ttree-node", ".part-chip", ".ed-cell",
  ".title-stats span", ".chip", ".gain-pill", ".load-chip", ".theme-chip",
  ".threat-tag", ".title-mark", ".end-best-tag",
  ".plate", ".plate-frame", ".level-card", ".level-thumb", ".end-card",
  ".hub-card", ".prep-card", ".pause-card", ".compose-sheet", ".tower-overlay",
  ".ttree-branch", ".forge-preview-wrap", ".ed-grid", "#forgePreview",
  "input[type='text']", "input[type='number']", "select",
].join(", ");

export function applyBtnTextures(root) {
  const els = root.querySelectorAll(ROUGH_SEL);
  els.forEach((el) => {
    const key = el.getAttribute("data-act") || el.id || el.textContent.trim().slice(0, 24);
    const seed = _hashStr(key);
    const idx = seed & 15;
    const rand = _prng(seed + 0xA5B9C3);
    const large = LARGE_RE.test(el.className);

    el.setAttribute("data-idx", idx);

    /* Rough-cut silhouette — per-element jagged chamfer (corroded edge) */
    el.style.setProperty("--rough-clip", _roughClip(rand, large));

    /* Noise tile offset — shifts the SVG noise so no two tiles align */
    el.style.setProperty("--tx", ((rand() * 120) | 0) - 60);
    el.style.setProperty("--ty", ((rand() * 120) | 0) - 60);

    /* Noise tile size — subtle scale variation per element */
    el.style.setProperty("--ns", (52 + (rand() * 28) | 0));

    /* Wear/damage spot — random position + aspect ratio */
    el.style.setProperty("--wx", (10 + (rand() * 80) | 0) + "%");
    el.style.setProperty("--wy", (10 + (rand() * 80) | 0) + "%");
    el.style.setProperty("--wd", (25 + (rand() * 40) | 0) + "%");
    el.style.setProperty("--wh", (20 + (rand() * 35) | 0) + "%");

    /* Naturalistic border color — subtle warm variation per element */
    const warmBase = [170, 160, 140]; /* base btn-border RGB */
    const r = warmBase[0] + ((rand() * 16) | 0) - 8;
    const g = warmBase[1] + ((rand() * 14) | 0) - 7;
    const b = warmBase[2] + ((rand() * 12) | 0) - 6;
    el.style.setProperty("--br-clr", `rgb(${r},${g},${b})`);
  });
}

let _mountedId = null;

export function mountScreen(container, id, state) {
  const existing = container.firstElementChild;
  const sameScreen = id === _mountedId;
  _mountedId = id;
  if (existing && !sameScreen && existing.classList.contains("meta-enter")) {
    existing.classList.remove("meta-enter");
    existing.classList.add("meta-exit");
    const onEnd = () => {
      existing.removeEventListener("animationend", onEnd);
      if (_mountedId === id) _swap(container, id, state, true);
    };
    existing.addEventListener("animationend", onEnd, { once: true });
    /* Fallback: if animation is disabled (reduced-motion), swap immediately */
    setTimeout(() => {
      if (_mountedId === id && container.firstElementChild === existing) _swap(container, id, state, true);
    }, 250);
    return id;
  }
  _swap(container, id, state, !sameScreen);
  return id;
}

function _swap(container, id, state, animate) {
  const html = screenHtml(id, state);
  container.innerHTML = html;
  if (!animate) container.firstElementChild?.classList.remove("meta-enter");
  applyBtnTextures(container);
}
