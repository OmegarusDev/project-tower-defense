/**
 * Lightweight procedural SVG chips for Forge / Tech / Arsenal.
 * Colors align with ProcPalette base/barrel/payload enamel.
 */

const BASE_COLORS = {
  sentry: "#4f7eb0",
  bulwark: "#6d746c",
  spire: "#c4783a",
  aerie: "#7a5a9a",
  warden: "#3d9a8e",
  talon: "#b86448",
};

const BARREL_COLORS = {
  single: "#9aa6b0",
  twin: "#8a96a0",
  scatter: "#b89968",
  rail: "#6a7680",
  pulse: "#6a9080",
  launcher: "#c4843e",
  flak: "#b8a878",
};

const PAYLOAD_COLORS = {
  kinetic: "#d8d2c4",
  pyro: "#e07a3a",
  shock: "#e6c84a",
  frost: "#7eb8c9",
  poison: "#9a6bb8",
  acid: "#7aad5c",
  breach: "#c8b090",
  emp: "#7ec8e8",
};

function svgWrap(inner, { size = 18, className = "part-ico" } = {}) {
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
}

/** Base silhouette — hexagonal mount plate tinted per base. */
function baseGlyph(id, opts) {
  const c = BASE_COLORS[id] || "#8a96a0";
  return svgWrap(
    `<polygon points="8,1.5 13.5,4.5 13.5,11.5 8,14.5 2.5,11.5 2.5,4.5" fill="${c}" stroke="#1a222c" stroke-width="0.8"/>
     <circle cx="8" cy="8" r="2.2" fill="#1a222c" opacity="0.35"/>`,
    opts
  );
}

/** Barrel glyph — tube shape varies by delivery. */
function barrelGlyph(id, opts) {
  const c = BARREL_COLORS[id] || "#9aa6b0";
  if (id === "twin") {
    return svgWrap(
      `<rect x="3" y="3" width="3.2" height="10" rx="0.8" fill="${c}" stroke="#1a222c" stroke-width="0.6"/>
       <rect x="9.8" y="3" width="3.2" height="10" rx="0.8" fill="${c}" stroke="#1a222c" stroke-width="0.6"/>`,
      opts
    );
  }
  if (id === "scatter" || id === "flak") {
    return svgWrap(
      `<path d="M3 12 L8 3 L13 12 Z" fill="${c}" stroke="#1a222c" stroke-width="0.7"/>
       <path d="M5.5 12 L8 7 L10.5 12" fill="none" stroke="#1a222c" stroke-width="0.6" opacity="0.5"/>`,
      opts
    );
  }
  if (id === "pulse") {
    return svgWrap(
      `<circle cx="8" cy="8" r="5.5" fill="none" stroke="${c}" stroke-width="1.6"/>
       <circle cx="8" cy="8" r="2.2" fill="${c}"/>`,
      opts
    );
  }
  if (id === "launcher") {
    return svgWrap(
      `<rect x="5" y="2" width="6" height="9" rx="1" fill="${c}" stroke="#1a222c" stroke-width="0.6"/>
       <circle cx="8" cy="13" r="2" fill="${c}" stroke="#1a222c" stroke-width="0.6"/>`,
      opts
    );
  }
  if (id === "rail") {
    return svgWrap(
      `<rect x="6.5" y="1.5" width="3" height="13" rx="0.6" fill="${c}" stroke="#1a222c" stroke-width="0.6"/>
       <rect x="5" y="3" width="6" height="1.4" fill="#1a222c" opacity="0.35"/>`,
      opts
    );
  }
  return svgWrap(
    `<rect x="6" y="2" width="4" height="12" rx="1" fill="${c}" stroke="#1a222c" stroke-width="0.7"/>`,
    opts
  );
}

/** Payload element mark — colored gem / bolt. */
function payloadGlyph(id, opts) {
  const c = PAYLOAD_COLORS[id] || "#d8d2c4";
  if (id === "shock" || id === "emp") {
    return svgWrap(
      `<path d="M9 1.5 L4.5 8.5 H8 L7 14.5 L12.5 6.5 H9 Z" fill="${c}" stroke="#1a222c" stroke-width="0.6"/>`,
      opts
    );
  }
  if (id === "frost") {
    return svgWrap(
      `<path d="M8 1.5 V14.5 M2.5 5.5 L13.5 10.5 M13.5 5.5 L2.5 10.5" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>`,
      opts
    );
  }
  if (id === "pyro") {
    return svgWrap(
      `<path d="M8 14 C4.5 14 3 10.5 5 8 C5.5 9.5 7 10 7 8 C7 5 8.5 3 10 2 C9.5 5.5 13 7 12 11 C11.5 13 10 14 8 14Z" fill="${c}" stroke="#1a222c" stroke-width="0.6"/>`,
      opts
    );
  }
  if (id === "poison") {
    return svgWrap(
      `<ellipse cx="8" cy="9" rx="4.2" ry="5" fill="${c}" stroke="#1a222c" stroke-width="0.6"/>
       <circle cx="8" cy="3.5" r="1.4" fill="${c}" stroke="#1a222c" stroke-width="0.5"/>`,
      opts
    );
  }
  if (id === "acid") {
    return svgWrap(
      `<path d="M5 3 H11 L12.5 13 H3.5 Z" fill="${c}" stroke="#1a222c" stroke-width="0.6"/>
       <circle cx="6.5" cy="9" r="1" fill="#1a222c" opacity="0.35"/>
       <circle cx="9.5" cy="10.5" r="0.8" fill="#1a222c" opacity="0.35"/>`,
      opts
    );
  }
  if (id === "breach") {
    return svgWrap(
      `<polygon points="8,2 13,8 8,14 3,8" fill="${c}" stroke="#1a222c" stroke-width="0.7"/>
       <polygon points="8,5 10.5,8 8,11 5.5,8" fill="#1a222c" opacity="0.4"/>`,
      opts
    );
  }
  return svgWrap(
    `<circle cx="8" cy="8" r="5" fill="${c}" stroke="#1a222c" stroke-width="0.8"/>
     <circle cx="8" cy="8" r="2" fill="#1a222c" opacity="0.3"/>`,
    opts
  );
}

export function partIconHtml(kind, id, opts = {}) {
  const o = { size: 18, className: "part-ico", ...opts };
  if (kind === "base") return baseGlyph(id, o);
  if (kind === "barrel") return barrelGlyph(id, o);
  if (kind === "payload") return payloadGlyph(id, o);
  return svgWrap(`<rect x="3" y="3" width="10" height="10" fill="#8a96a0"/>`, o);
}

/** Category chips for Foundations / Arsenal branch headers & nodes. */
export function techCategoryIcon(groupId, nodeId = "") {
  const opts = { className: "tech-ico", size: 16 };
  const id = groupId || "";
  if (id === "g_roster" || nodeId === "level_cap" || nodeId === "roster_slots") {
    return svgWrap(
      `<rect x="2" y="3" width="4.5" height="10" rx="0.6" fill="#c9a06a"/>
       <rect x="7.5" y="3" width="4.5" height="10" rx="0.6" fill="#8a96a0" opacity="0.85"/>
       <rect x="13" y="5" width="1.2" height="6" fill="#5a6670"/>`,
      opts
    );
  }
  if (id === "g_bastion" || nodeId === "lives" || nodeId === "cash") {
    if (nodeId === "cash") {
      return svgWrap(
        `<circle cx="8" cy="8" r="6" fill="#d4b06a" stroke="#1a222c" stroke-width="0.7"/>
         <path d="M8 4.5 V11.5 M6 6.2 C6.8 5.4 9.2 5.4 10 6.2 C10.6 6.8 10.6 7.6 8 8 C5.4 8.4 5.4 9.4 6.2 10 C7 10.8 9 10.8 10 10" stroke="#1a222c" stroke-width="1.1" fill="none" stroke-linecap="round"/>`,
        opts
      );
    }
    return svgWrap(
      `<path d="M8 1.5 L13.5 4 V8.5 C13.5 11.5 10.5 14 8 14.5 C5.5 14 2.5 11.5 2.5 8.5 V4 Z" fill="#c45a4a" stroke="#1a222c" stroke-width="0.7"/>
       <rect x="5.2" y="6.2" width="5.6" height="4.2" rx="0.6" fill="#f0e8e0" opacity="0.9"/>`,
      opts
    );
  }
  if (id === "g_economy") {
    return svgWrap(
      `<circle cx="6" cy="7" r="4.2" fill="#d4b06a" stroke="#1a222c" stroke-width="0.6"/>
       <circle cx="10.5" cy="9.5" r="3.6" fill="#9aa6b0" stroke="#1a222c" stroke-width="0.6"/>`,
      opts
    );
  }
  if (id === "g_doctrine") {
    return svgWrap(
      `<circle cx="8" cy="8" r="5.5" fill="none" stroke="#c9a227" stroke-width="1.2"/>
       <circle cx="8" cy="8" r="1.6" fill="#c9a227"/>
       <path d="M8 1.5 V3.5 M8 12.5 V14.5 M1.5 8 H3.5 M12.5 8 H14.5" stroke="#c9a227" stroke-width="1"/>`,
      opts
    );
  }
  if (id === "g_bases") return baseGlyph("sentry", opts);
  if (id === "g_barrels") return barrelGlyph("single", opts);
  if (id === "g_payloads") return payloadGlyph("kinetic", opts);
  return svgWrap(
    `<rect x="3" y="3" width="10" height="10" rx="1" fill="#8a96a0" stroke="#1a222c" stroke-width="0.6"/>`,
    opts
  );
}

/** Icon for a buyable tech node (arsenal part or foundations category). */
export function techNodeIconHtml(def, groupId = "") {
  if (def?.partKind && def?.partId) {
    return partIconHtml(def.partKind, def.partId, { size: 16, className: "tech-ico" });
  }
  return techCategoryIcon(groupId || "", def?.id);
}
