// Per-step sidecar writer: takes a full-viewport screenshot and writes a
// matching .json with index/label/observation/section/timestamp.
//
// Schema (consumed by lib/report.js):
//   <run-dir>/steps/NNN-<slug>.png
//   <run-dir>/steps/NNN-<slug>.json  { index, label, observation, section, ts, screenshot }

import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function utf8NoBom(path, text) { writeFileSync(path, text, "utf8"); }
function stripAnsi(s) { return String(s).replace(/\x1b\[[0-9;]*m/g, ""); }

export class StepRecorder {
  constructor(runDir) {
    this.runDir = runDir;
    this.stepsDir = join(runDir, "steps");
    // Resume from existing step count so multiple invocations against the
    // same run dir keep numbering monotonic.
    try {
      this.index = readdirSync(this.stepsDir).filter(f => f.endsWith(".json")).length;
    } catch {
      this.index = 0;
    }
    this.section = null;
  }

  setSection(section) {
    this.section = section || null;
  }

  async record(page, label, observation) {
    observation = stripAnsi(observation || "");
    this.index += 1;
    const idx = String(this.index).padStart(3, "0");
    const slug = String(label || "step")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "step";
    const base = `${idx}-${slug}`;
    const png = join(this.stepsDir, `${base}.png`);
    await page.screenshot({ path: png, fullPage: false });
    utf8NoBom(
      join(this.stepsDir, `${base}.json`),
      JSON.stringify({
        index: this.index,
        label,
        observation,
        section: this.section,
        ts: new Date().toISOString(),
        screenshot: `steps/${base}.png`,
      }, null, 2)
    );
    return { index: this.index, base };
  }
}
