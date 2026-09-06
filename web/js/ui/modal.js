/**
 * Cinder-sheet — the in-game confirm dialog replacing every native
 * confirm(). Promise-based; one at a time (a second call queues behind
 * the first). Esc / backdrop / Cancel resolve false.
 */
let active = null;
let queue = [];

function render(container, spec) {
  const sheet = document.createElement("div");
  sheet.className = "confirm-sheet";
  sheet.innerHTML = `
    <button type="button" class="confirm-backdrop" data-act="confirm-dismiss" aria-label="Dismiss"></button>
    <div class="confirm-card plate" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
      <p class="confirm-mark">${spec.mark || "Stand By"}</p>
      <h2 id="confirmTitle">${spec.title}</h2>
      <p class="confirm-note">${spec.note || ""}</p>
      <div class="confirm-actions">
        <button type="button" class="btn ${spec.danger ? "danger" : "title-cta"}" data-act="confirm-ok">${spec.confirmLabel || "Confirm"}</button>
        <button type="button" class="btn secondary" data-act="confirm-cancel">Cancel</button>
      </div>
    </div>`;
  container.appendChild(sheet);
  sheet.querySelector('[data-act="confirm-ok"]').focus();
  return sheet;
}

function renderHold(container, spec, outerResolve) {
  const dur = spec.holdMs || 2000;
  const sheet = document.createElement("div");
  sheet.className = "confirm-sheet";
  sheet.innerHTML = `
    <button type="button" class="confirm-backdrop" data-act="confirm-dismiss" aria-label="Dismiss"></button>
    <div class="confirm-card plate" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
      <p class="confirm-mark">${spec.mark || "Stand By"}</p>
      <h2 id="confirmTitle">${spec.title}</h2>
      <p class="confirm-note">${spec.note || ""}</p>
      <div class="confirm-actions">
        <button type="button" class="btn danger hold-btn" data-act="hold-ok">
          <span class="hold-fill"></span>
          <span class="hold-label">${spec.confirmLabel || "Hold to Confirm"}</span>
        </button>
        <button type="button" class="btn secondary" data-act="confirm-cancel">Cancel</button>
      </div>
    </div>`;
  container.appendChild(sheet);

  const btn = sheet.querySelector('[data-act="hold-ok"]');
  const fill = sheet.querySelector(".hold-fill");
  let timer = null;
  let done = false;

  const finish = (result) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    sheet._cleanup();
    sheet.remove();
    active = null;
    const next = queue.shift();
    if (next) next();
    outerResolve(result);
  };

  const startHold = () => {
    if (done) return;
    btn.classList.add("holding");
    fill.style.transition = `width ${dur}ms linear`;
    void fill.offsetWidth;
    fill.style.width = "100%";
    timer = setTimeout(() => finish(true), dur);
  };

  const cancelHold = () => {
    if (done) return;
    clearTimeout(timer);
    btn.classList.remove("holding");
    fill.style.transition = "none";
    fill.style.width = "0%";
  };

  btn.addEventListener("mousedown", startHold);
  btn.addEventListener("touchstart", startHold, { passive: true });
  btn.addEventListener("mouseup", cancelHold);
  btn.addEventListener("mouseleave", cancelHold);
  btn.addEventListener("touchend", cancelHold);
  btn.addEventListener("touchcancel", cancelHold);

  const onClick = (e) => {
    const el = e.target.closest?.("[data-act]");
    if (!el || !sheet.contains(el)) return;
    const act = el.getAttribute("data-act");
    if (act === "confirm-cancel" || act === "confirm-dismiss") finish(false);
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      finish(false);
    }
  };
  container.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);

  sheet._cleanup = () => {
    clearTimeout(timer);
    container.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey);
  };
}

/** Ask a yes/no question with the Cinder-sheet. Resolves true/false. */
export function confirmSheet(container, spec) {
  return new Promise((resolve) => {
    const start = () => {
      const sheet = render(container, spec);
      const finish = (result) => {
        sheet._cleanup();
        sheet.remove();
        active = null;
        const next = queue.shift();
        if (next) next();
        resolve(result);
      };
      const onClick = (e) => {
        const el = e.target.closest?.("[data-act]");
        if (!el || !sheet.contains(el)) return;
        const act = el.getAttribute("data-act");
        if (act === "confirm-ok") finish(true);
        else if (act === "confirm-cancel" || act === "confirm-dismiss") finish(false);
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          finish(false);
        }
      };
      container.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
      sheet._cleanup = () => {
        container.removeEventListener("click", onClick);
        document.removeEventListener("keydown", onKey);
      };
    };
    if (active) queue.push(start);
    else {
      active = start;
      start();
    }
  });
}

/** Hold-to-confirm variant. Resolves true only if held for holdMs. */
export function holdConfirmSheet(container, spec) {
  return new Promise((outerResolve) => {
    const start = () => {
      renderHold(container, spec, outerResolve);
    };
    if (active) queue.push(start);
    else {
      active = start;
      start();
    }
  });
}
