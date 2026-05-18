// In-page overlay: pulsing rings on click/type/hover + full-width chapter banner.
// Installed once per browser context via `context.addInitScript(installHighlight)`.
// Exposes window.__uiReplayFlash(x,y,w,h,kind,label) and window.__uiReplayBanner(tag,title,subtitle).

export function installHighlight() {
  if (window.__uiReplayHighlightInstalled) return;
  window.__uiReplayHighlightInstalled = true;

  const css = [
    ".__ui-ring { position: fixed; pointer-events: none; z-index: 2147483647;",
    "  border: 4px solid #ffcc00; border-radius: 8px;",
    "  box-shadow: 0 0 24px rgba(255,204,0,0.9), inset 0 0 12px rgba(255,204,0,0.3);",
    "  animation: __ui-pulse 700ms ease-out forwards; }",
    ".__ui-ring.click { border-color: #ff5050;",
    "  box-shadow: 0 0 24px rgba(255,80,80,0.95), inset 0 0 12px rgba(255,80,80,0.3); }",
    ".__ui-ring.type  { border-color: #50ddff;",
    "  box-shadow: 0 0 24px rgba(80,221,255,0.95), inset 0 0 12px rgba(80,221,255,0.3); }",
    ".__ui-ring.hover { border-color: #50ff88;",
    "  box-shadow: 0 0 24px rgba(80,255,136,0.95), inset 0 0 12px rgba(80,255,136,0.3); }",
    "@keyframes __ui-pulse {",
    "  0%   { opacity: 0; transform: scale(0.7); }",
    "  25%  { opacity: 1; transform: scale(1.05); }",
    "  100% { opacity: 0; transform: scale(1.25); } }",
    ".__ui-label { position: fixed; pointer-events: none; z-index: 2147483647;",
    "  background: rgba(0,0,0,0.88); color: white; padding: 4px 10px; border-radius: 4px;",
    "  font: 13px/1.3 -apple-system, 'Segoe UI', system-ui, sans-serif; max-width: 360px;",
    "  box-shadow: 0 2px 8px rgba(0,0,0,0.6); }",
    ".__ui-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;",
    "  pointer-events: none;",
    "  background: linear-gradient(180deg, rgba(15,23,42,0.97), rgba(15,23,42,0.92));",
    "  color: #f8fafc; padding: 28px 36px 24px; text-align: center;",
    "  border-bottom: 5px solid #3b82f6; box-shadow: 0 12px 40px rgba(0,0,0,0.7);",
    "  animation: __ui-banner-in 320ms ease-out, __ui-banner-out 360ms ease-in 2000ms forwards; }",
    ".__ui-banner-tag { display: inline-block; padding: 3px 10px; background: #3b82f6;",
    "  color: white; border-radius: 3px; font: 700 11px/1 -apple-system, sans-serif;",
    "  letter-spacing: 1px; text-transform: uppercase; margin-bottom: 10px; }",
    ".__ui-banner-title { font: 700 30px/1.2 -apple-system, 'Segoe UI', system-ui, sans-serif;",
    "  margin: 0 0 6px; letter-spacing: 0.5px; }",
    ".__ui-banner-sub { font: 14px/1.4 -apple-system, system-ui, sans-serif;",
    "  color: #cbd5e1; max-width: 720px; margin: 0 auto; }",
    "@keyframes __ui-banner-in {",
    "  from { opacity: 0; transform: translateY(-100%); }",
    "  to   { opacity: 1; transform: translateY(0); } }",
    "@keyframes __ui-banner-out {",
    "  from { opacity: 1; transform: translateY(0); }",
    "  to   { opacity: 0; transform: translateY(-30%); } }",
  ].join("\n");

  function ensureStyle() {
    if (document.getElementById("__ui-replay-style")) return;
    const head = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
    const style = document.createElement("style");
    style.id = "__ui-replay-style";
    style.textContent = css;
    head.appendChild(style);
  }

  window.__uiReplayBanner = function (tag, title, subtitle) {
    ensureStyle();
    const prev = document.querySelector(".__ui-banner");
    if (prev) prev.remove();
    const b = document.createElement("div");
    b.className = "__ui-banner";
    const tagEl = document.createElement("span");
    tagEl.className = "__ui-banner-tag";
    tagEl.textContent = tag || "SECTION";
    const titleEl = document.createElement("div");
    titleEl.className = "__ui-banner-title";
    titleEl.textContent = title || "";
    b.appendChild(tagEl);
    b.appendChild(titleEl);
    if (subtitle) {
      const sub = document.createElement("div");
      sub.className = "__ui-banner-sub";
      sub.textContent = subtitle;
      b.appendChild(sub);
    }
    (document.body || document.documentElement).appendChild(b);
    setTimeout(function () { b.remove(); }, 2700);
  };

  window.__uiReplayFlash = function (x, y, w, h, kind, label) {
    ensureStyle();
    const k = kind || "click";
    const padX = 8, padY = 6;
    const ring = document.createElement("div");
    ring.className = "__ui-ring " + k;
    ring.style.left   = (x - padX) + "px";
    ring.style.top    = (y - padY) + "px";
    ring.style.width  = (w + padX * 2) + "px";
    ring.style.height = (h + padY * 2) + "px";
    (document.body || document.documentElement).appendChild(ring);
    setTimeout(function () { ring.remove(); }, 720);

    if (label) {
      const lbl = document.createElement("div");
      lbl.className = "__ui-label";
      lbl.textContent = label;
      lbl.style.left = (x + w + 12) + "px";
      lbl.style.top  = Math.max(8, y - 4) + "px";
      (document.body || document.documentElement).appendChild(lbl);
      setTimeout(function () { lbl.remove(); }, 1600);
    }
  };
}
