// Build a self-contained replay.html for one run dir. Ported from the autogo
// scripts/build-replay-report.mjs — same schema, generic naming.
//
// Output: <run-dir>/replay.html, all relative-path links to siblings.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

function readJson(path) {
  let s = readFileSync(path, "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s;
}

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtBytes(n) {
  if (!n) return "0 B";
  const k = 1024;
  const u = ["B", "KiB", "MiB", "GiB"];
  let i = 0;
  while (n >= k && i < u.length - 1) { n /= k; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function listOrEmpty(runDir, dir, ext) {
  const p = join(runDir, dir);
  if (!existsSync(p)) return [];
  return readdirSync(p)
    .filter(f => f.toLowerCase().endsWith(ext))
    .sort()
    .map(f => ({
      name: f,
      rel: `${dir}/${f}`,
      size: statSync(join(p, f)).size,
    }));
}

function renderList(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return `<ol>${items.map(s => `<li>${esc(s)}</li>`).join("")}</ol>`;
}

function renderCaseMeta(m) {
  if (!m) return "";
  return `<div class="case-meta">
            <h3 class="case-title">${esc(m.title || "")}</h3>
            ${m.goal ? `<p class="case-goal"><strong>Goal:</strong> ${esc(m.goal)}</p>` : ""}
            ${m.scenario ? `<div class="case-block"><strong>Steps</strong>${renderList(m.scenario)}</div>` : ""}
            ${m.expected ? `<div class="case-block"><strong>Expected</strong>${renderList(m.expected)}</div>` : ""}
          </div>`;
}

function renderStep(s) {
  return `<article class="step" data-section="${esc(s.section || "")}">
    <header>
      <span class="idx">#${String(s.index).padStart(3, "0")}</span>
      <span class="sec">${esc(s.section || "")}</span>
      <span class="label">${esc(s.label)}</span>
      <time>${esc(s.ts || "")}</time>
    </header>
    ${s._png
      ? `<a class="thumb" href="${esc(s._png)}" target="_blank" rel="noopener">
           <img src="${esc(s._png)}" loading="lazy" alt="${esc(s.label)}" />
           <span class="sz">${fmtBytes(s._pngSize)}</span>
         </a>`
      : `<div class="thumb missing">screenshot missing</div>`}
    <p class="obs">${esc(s.observation || "")}</p>
  </article>`;
}

export function buildReport(runDir) {
  if (!existsSync(runDir)) throw new Error(`run dir not found: ${runDir}`);

  let meta = {};
  const metaPath = join(runDir, "meta.json");
  if (existsSync(metaPath)) {
    try { meta = JSON.parse(readJson(metaPath)); }
    catch (e) { console.warn(`failed to parse meta.json: ${e.message}`); }
  }

  const stepsDir = join(runDir, "steps");
  const steps = [];
  if (existsSync(stepsDir)) {
    const jsons = readdirSync(stepsDir).filter(f => f.endsWith(".json")).sort();
    for (const j of jsons) {
      try {
        const s = JSON.parse(readJson(join(stepsDir, j)));
        const pngRel = s.screenshot || `steps/${j.replace(/\.json$/, ".png")}`;
        const pngAbs = join(runDir, pngRel);
        s._png = existsSync(pngAbs) ? pngRel : null;
        s._pngSize = s._png ? statSync(pngAbs).size : 0;
        steps.push(s);
      } catch (e) {
        console.warn(`skip step ${j}: ${e.message}`);
      }
    }
  }

  const traces = listOrEmpty(runDir, "trace", ".zip");
  const videos = listOrEmpty(runDir, "videos", ".webm");

  let sectionMeta = {};
  const sectionMetaPath = join(runDir, "meta-sections.json");
  if (existsSync(sectionMetaPath)) {
    try { sectionMeta = JSON.parse(readJson(sectionMetaPath)); }
    catch (e) { console.warn(`failed to parse meta-sections.json: ${e.message}`); }
  }
  function metaForFilename(filename) {
    const m = filename.match(/^section-([0-9A-Za-z._-]+)\.[a-z]+$/);
    if (!m) return null;
    return sectionMeta[m[1]] || null;
  }

  const groupOrder = [];
  const groupedSteps = new Map();
  for (const s of steps) {
    const key = s.section || "(unsectioned)";
    if (!groupedSteps.has(key)) { groupedSteps.set(key, []); groupOrder.push(key); }
    groupedSteps.get(key).push(s);
  }
  const metaKeys = Object.keys(sectionMeta);
  const orderedKeys = [
    ...metaKeys.filter(k => groupedSteps.has(k)),
    ...groupOrder.filter(k => !metaKeys.includes(k)),
  ];

  const stepsHtml = orderedKeys.map(key => {
    const groupSteps = groupedSteps.get(key) || [];
    if (groupSteps.length === 0) return "";
    const m = sectionMeta[key] || null;
    const header = m
      ? renderCaseMeta(m)
      : `<div class="case-meta case-meta-fallback"><h3 class="case-title">${esc(key)}</h3></div>`;
    return `<div class="section-group" data-section="${esc(key)}">
      ${header}
      <div class="steps-subgrid">
        ${groupSteps.map(renderStep).join("\n")}
      </div>
    </div>`;
  }).join("\n");

  const sectionFilter = orderedKeys.filter(k => groupedSteps.get(k)?.length > 0);

  const tracesHtml = traces.length === 0
    ? `<p class="empty">no trace files</p>`
    : `<ul>${traces.map(t => `<li><a href="${esc(t.rel)}" target="_blank" rel="noopener">${esc(t.name)}</a> <span class="sz">${fmtBytes(t.size)}</span></li>`).join("")}</ul>
       <p class="hint">open with: <code>npx playwright show-trace ${esc(traces[0].rel)}</code></p>`;

  const SPEED_OPTIONS = [0.5, 1, 1.5, 2, 3, 4];
  const DEFAULT_SPEED = 2;

  const videosHtml = videos.length === 0
    ? `<p class="empty">no video files</p>`
    : videos.map((v, i) => {
        const m = metaForFilename(v.name);
        const metaBlock = renderCaseMeta(m);
        const vid = `vid${i}`;
        const speedOpts = SPEED_OPTIONS
          .map(s => `<option value="${s}"${s === DEFAULT_SPEED ? " selected" : ""}>${s}×</option>`)
          .join("");
        return `
          <figure class="video-card">
            ${metaBlock}
            <video id="${vid}" class="replay-video" controls preload="metadata" src="${esc(v.rel)}"></video>
            <div class="video-controls">
              <label for="speed-${vid}">▶ Speed</label>
              <select id="speed-${vid}" class="speed-select" data-target="${vid}">${speedOpts}</select>
              <span class="hint">default ${DEFAULT_SPEED}× · video is realtime</span>
            </div>
            <figcaption><a href="${esc(v.rel)}" download>${esc(v.name)}</a> <span class="sz">${fmtBytes(v.size)}</span></figcaption>
          </figure>
        `;
      }).join("\n");

  const title = `replay · ${esc(meta.run_id || basename(runDir))}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; margin: 0; padding: 24px; max-width: 1400px; }
  h1 { margin: 0 0 8px; font-size: 20px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  .meta code { background: rgba(127,127,127,0.15); padding: 1px 6px; border-radius: 3px; }
  .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .filters button { padding: 4px 10px; border: 1px solid #888; background: transparent; cursor: pointer; border-radius: 4px; font: inherit; }
  .filters button.active { background: #2a6df4; color: white; border-color: #2a6df4; }
  section.panel { border-top: 1px solid rgba(127,127,127,0.3); padding: 16px 0; }
  section.panel h2 { font-size: 15px; margin: 0 0 10px; }
  .steps { display: flex; flex-direction: column; gap: 24px; }
  .section-group { display: flex; flex-direction: column; gap: 10px; }
  .section-group .case-meta { margin-bottom: 0; }
  .case-meta-fallback { background: rgba(127,127,127,0.06); border-left-color: #888; }
  .case-meta-fallback .case-title { color: #888; }
  .steps-subgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
  .step { border: 1px solid rgba(127,127,127,0.3); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; }
  .step header { display: flex; gap: 6px; align-items: baseline; font-size: 11px; margin-bottom: 6px; flex-wrap: wrap; }
  .step .idx { font-family: ui-monospace, Consolas, monospace; color: #888; }
  .step .sec { color: #2a6df4; font-weight: 600; }
  .step .label { font-weight: 600; font-size: 13px; flex: 1; }
  .step time { color: #888; font-size: 10px; }
  .thumb { display: block; position: relative; background: rgba(127,127,127,0.1); border-radius: 4px; overflow: hidden; min-height: 120px; }
  .thumb img { width: 100%; display: block; }
  .thumb .sz { position: absolute; right: 4px; bottom: 4px; background: rgba(0,0,0,0.6); color: white; padding: 1px 6px; font-size: 10px; border-radius: 3px; }
  .thumb.missing { display: flex; align-items: center; justify-content: center; color: #888; font-size: 12px; padding: 40px 8px; }
  .obs { margin: 6px 0 0; font-size: 12px; color: #555; }
  ul { margin: 0; padding-left: 18px; }
  ul .sz { color: #888; font-size: 11px; }
  .empty { color: #888; font-style: italic; }
  .hint { font-size: 12px; color: #666; }
  .hint code { background: rgba(127,127,127,0.15); padding: 1px 6px; border-radius: 3px; }
  video { max-width: 100%; max-height: 540px; display: block; }
  .video-card { margin: 0 0 32px; padding: 0; }
  .video-card figcaption { font-size: 12px; color: #888; margin-top: 4px; }
  .video-controls { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: rgba(127,127,127,0.06); border-radius: 0 0 4px 4px; font-size: 12px; }
  .video-controls label { font-weight: 600; color: #2a6df4; }
  .video-controls .speed-select { padding: 3px 8px; border: 1px solid rgba(127,127,127,0.4); border-radius: 4px; font: inherit; background: transparent; cursor: pointer; }
  .video-controls .hint { color: #888; font-size: 11px; margin-left: auto; }
  .case-meta { border-left: 3px solid #2a6df4; padding: 8px 14px; margin-bottom: 10px; background: rgba(42,109,244,0.06); border-radius: 0 6px 6px 0; }
  .case-title { margin: 0 0 6px; font-size: 16px; color: #2a6df4; }
  .case-goal { margin: 0 0 8px; }
  .case-block { margin: 6px 0; }
  .case-block strong { display: inline-block; min-width: 70px; font-size: 12px; color: #2a6df4; }
  .case-block ol { margin: 4px 0 4px 18px; padding: 0; }
  .case-block li { font-size: 13px; margin: 2px 0; }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1a1a; color: #ddd; }
    .obs { color: #aaa; }
    .meta { color: #999; }
    .case-meta { background: rgba(80,158,255,0.08); border-left-color: #50aaff; }
    .case-title { color: #6cc3ff; }
    .case-block strong { color: #6cc3ff; }
  }
</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <div class="meta">
    commit <code>${esc(meta.commit || "?")}</code>
    · branch <code>${esc(meta.branch || "?")}</code>
    · started ${esc(meta.started_at || "?")}
    · finished ${esc(meta.finished_at || "(unfinished)")}
    · ${steps.length} steps
    · total ${fmtBytes(meta.total_bytes || 0)}
  </div>

  <section class="panel">
    <h2>steps timeline</h2>
    <div class="filters">
      <button class="active" data-sec="">all</button>
      ${sectionFilter.map(s => `<button data-sec="${esc(s)}">${esc(s)}</button>`).join("")}
    </div>
    <div class="steps">
      ${stepsHtml || `<p class="empty">no steps recorded</p>`}
    </div>
  </section>

  <section class="panel">
    <h2>playwright traces</h2>
    ${tracesHtml}
  </section>

  <section class="panel">
    <h2>videos</h2>
    ${videosHtml}
  </section>

<script>
  document.querySelectorAll(".filters button").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".filters button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      const want = b.dataset.sec;
      document.querySelectorAll(".section-group").forEach(g => {
        g.style.display = (!want || g.dataset.section === want) ? "" : "none";
      });
    });
  });

  const DEFAULT_SPEED = ${DEFAULT_SPEED};
  document.querySelectorAll("video.replay-video").forEach(v => {
    const apply = () => {
      const sel = document.querySelector(\`select[data-target="\${v.id}"]\`);
      const rate = sel ? parseFloat(sel.value) : DEFAULT_SPEED;
      v.playbackRate = isFinite(rate) && rate > 0 ? rate : DEFAULT_SPEED;
    };
    v.addEventListener("loadedmetadata", apply);
    v.addEventListener("play", apply);
    if (v.readyState >= 1) apply();
  });
  document.querySelectorAll(".speed-select").forEach(sel => {
    sel.addEventListener("change", () => {
      const v = document.getElementById(sel.dataset.target);
      if (v) v.playbackRate = parseFloat(sel.value);
    });
  });
</script>
</body>
</html>`;

  const outPath = join(runDir, "replay.html");
  writeFileSync(outPath, html, "utf8");
  return { outPath, stepCount: steps.length, traceCount: traces.length, videoCount: videos.length };
}
