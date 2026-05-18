// Cross-platform run dir lifecycle. Replaces the autogo replay-init.ps1 /
// replay-finish.ps1 / replay-prune.ps1 trio with pure Node so Linux/macOS
// users get the same behavior.
//
//   <project>/test-artifacts/replays/<YYYYMMDD-HHmmss>[-<label>]/
//     steps/   trace/   videos/   meta.json   replay.html (after report)

import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

const DEFAULT_REPLAYS_REL = "test-artifacts/replays";

function utf8NoBom(path, text) { writeFileSync(path, text, "utf8"); }
function readJson(path) {
  if (!existsSync(path)) return {};
  let s = readFileSync(path, "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  try { return JSON.parse(s); } catch { return {}; }
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function gitInfo(repoRoot) {
  const opts = { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] };
  let commit = null, branch = null;
  try { commit = execSync("git rev-parse --short HEAD", opts).toString().trim(); } catch {}
  try { branch = execSync("git rev-parse --abbrev-ref HEAD", opts).toString().trim(); } catch {}
  return { commit, branch };
}

export function initRun({ projectRoot, replaysRoot, label } = {}) {
  projectRoot = projectRoot || process.cwd();
  replaysRoot = replaysRoot || join(projectRoot, DEFAULT_REPLAYS_REL);
  mkdirSync(replaysRoot, { recursive: true });

  const ts = stamp();
  const runId = label ? `${ts}-${label}` : ts;
  const runDir = join(replaysRoot, runId);
  mkdirSync(runDir, { recursive: true });
  for (const sub of ["steps", "trace", "videos"]) {
    mkdirSync(join(runDir, sub), { recursive: true });
  }

  const { commit, branch } = gitInfo(projectRoot);
  const meta = {
    run_id: runId,
    label: label || "",
    started_at: new Date().toISOString(),
    commit,
    branch,
    finished_at: null,
    sections: [],
    total_bytes: null,
  };
  utf8NoBom(join(runDir, "meta.json"), JSON.stringify(meta, null, 2));
  return runDir;
}

function dirSizeBytes(dir) {
  let total = 0;
  const walk = (p) => {
    let entries;
    try { entries = readdirSync(p, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(p, e.name);
      if (e.isDirectory()) walk(full);
      else { try { total += statSync(full).size; } catch {} }
    }
  };
  walk(dir);
  return total;
}

function distinctSections(stepsDir) {
  if (!existsSync(stepsDir)) return [];
  const seen = new Set();
  for (const f of readdirSync(stepsDir)) {
    if (!f.endsWith(".json")) continue;
    const j = readJson(join(stepsDir, f));
    if (j.section) seen.add(j.section);
  }
  return [...seen];
}

export function finishRun({ runDir }) {
  const metaPath = join(runDir, "meta.json");
  const meta = readJson(metaPath);
  const total = dirSizeBytes(runDir);
  const sections = distinctSections(join(runDir, "steps"));
  const out = {
    run_id: meta.run_id ?? basename(runDir),
    label: meta.label ?? "",
    started_at: meta.started_at ?? null,
    finished_at: new Date().toISOString(),
    commit: meta.commit ?? null,
    branch: meta.branch ?? null,
    sections,
    total_bytes: total,
  };
  utf8NoBom(metaPath, JSON.stringify(out, null, 2));
  return out;
}

// Keep the N most-recent run dirs, plus any whose label matches `keepLabels`.
// All other run dirs under <replaysRoot> are removed.
export function pruneRuns({ replaysRoot, keepRecent = 5, keepLabels = [] } = {}) {
  if (!existsSync(replaysRoot)) return { removed: [], kept: [] };
  const labelRes = keepLabels.map(p => p instanceof RegExp ? p : new RegExp(p));
  const entries = readdirSync(replaysRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const full = join(replaysRoot, e.name);
      let mtime = 0;
      try { mtime = statSync(full).mtimeMs; } catch {}
      return { name: e.name, full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const kept = [], removed = [];
  let recentBudget = keepRecent;
  for (const ent of entries) {
    const keepByLabel = labelRes.some(re => re.test(ent.name));
    const keepByRecent = recentBudget > 0;
    if (keepByLabel || keepByRecent) {
      kept.push(ent.full);
      if (!keepByLabel) recentBudget -= 1;
    } else {
      try { rmSync(ent.full, { recursive: true, force: true }); removed.push(ent.full); } catch {}
    }
  }
  return { removed, kept };
}
