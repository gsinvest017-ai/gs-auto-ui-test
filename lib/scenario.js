// YAML scenario engine.
//
// A scenario file describes one or more sections, each with an ordered list
// of steps. Each step is one verb (goto/click/fill/hover/select/wait/banner/
// assert_*/screenshot/eval) plus its arguments. The engine wires steps onto
// the action wrappers (lib/actions.js) and StepRecorder (lib/record.js), and
// runs every section in a fresh browser context with trace + WebM recording.
//
// Top-level scenario shape:
//
//   name: my-suite                 # required, free text
//   base_url: http://localhost:3000
//   viewport: { width: 1280, height: 900 }
//   slow_mo_ms: 500                # delay between actions, default 0
//   console_guard:
//     ignore: ["favicon\\.ico"]    # regex strings
//   sections:
//     - id: smoke
//       title: §1 Smoke
//       goal: app loads, no console errors
//       scenario:                  # human-readable, rendered in replay.html
//         - "GET / and wait for h1"
//       expected:
//         - "<title> contains 'TodoMVC'"
//       fail_fast: true            # default true; false = collect errors
//       steps:
//         - banner: { tag: SECTION 1, title: Smoke }
//         - goto: /
//         - wait_for: { selector: "h1", timeout: 5000 }
//         - screenshot: { label: home }
//         - assert_title_contains: TodoMVC
//
// Step verbs (all keys optional unless marked required):
//
//   goto: "/path"                              (or { url: "/path", wait_until: "domcontentloaded" })
//   click: "#sel"                              (or { selector: "#sel", label: "...", nth: 0 })
//   fill: { selector: "#sel", value: "x" }
//   hover: "#sel"
//   select: { selector: "#sel", value: "v" }
//   check: "#sel"
//   press: { selector: "#sel", key: "Enter" }
//   wait_for: { selector: "#sel", timeout: 5000, state: "visible" }
//   wait_for_url: { url: "/foo", timeout: 5000 }   (regex or substring)
//   wait_ms: 1000
//   banner: { tag: "...", title: "...", subtitle: "..." }
//   screenshot: { label: "step-name", observation: "free text" }
//   eval: "() => document.title"                   (return value -> recorded)
//   assert_selector_count: { selector: "#x li", min: 1, max: 10 }
//   assert_title_contains: "substr"
//   assert_url_contains:   "substr"
//   assert_text:    { selector: "#sel", contains: "substr" }
//   assert_visible: "#sel"
//   assert_hidden:  "#sel"

import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { chromium } from "playwright";
import YAML from "yaml";

import { installHighlight } from "./highlight.js";
import { uiClick, uiFill, uiCheck, uiHover, uiSelect, showBanner, flashLocator } from "./actions.js";
import { attachConsoleGuard } from "./console-guard.js";
import { StepRecorder } from "./record.js";

function readYaml(path) {
  if (!existsSync(path)) throw new Error(`scenario file not found: ${path}`);
  let s = readFileSync(path, "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return YAML.parse(s);
}

function joinUrl(base, path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path;
  return base.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
}

function resolveStep(step) {
  // Each step is an object with exactly one verb key (plus optional `label`).
  const keys = Object.keys(step);
  const verb = keys.find(k => k !== "label" && k !== "_comment");
  if (!verb) throw new Error(`step has no verb: ${JSON.stringify(step)}`);
  return { verb, arg: step[verb], label: step.label };
}

function normSelectorArg(arg) {
  if (typeof arg === "string") return { selector: arg };
  return arg || {};
}

async function runStep(ctx, step) {
  const { page, recorder, baseUrl } = ctx;
  const { verb, arg, label } = resolveStep(step);

  switch (verb) {

    case "goto": {
      const a = typeof arg === "string" ? { url: arg } : (arg || {});
      const url = joinUrl(baseUrl, a.url);
      await page.goto(url, { waitUntil: a.wait_until || "domcontentloaded" });
      await recorder.record(page, label || `goto ${a.url}`, `GET ${url}`);
      break;
    }

    case "click": {
      const a = normSelectorArg(arg);
      if (typeof a.nth === "number") {
        const loc = page.locator(a.selector).nth(a.nth);
        await flashLocator(loc, "click", label || `click ${a.selector}[${a.nth}]`);
        await loc.click();
        await page.waitForTimeout(200);
      } else {
        await uiClick(page, a.selector, label || `click ${a.selector}`);
      }
      break;
    }

    case "fill": {
      const a = arg || {};
      await uiFill(page, a.selector, String(a.value ?? ""), label);
      break;
    }

    case "hover": {
      const a = normSelectorArg(arg);
      await uiHover(page, a.selector, label);
      break;
    }

    case "select": {
      const a = arg || {};
      await uiSelect(page, a.selector, a.value, label);
      break;
    }

    case "check": {
      const a = normSelectorArg(arg);
      await uiCheck(page, a.selector, label);
      break;
    }

    case "press": {
      const a = arg || {};
      if (a.selector) await page.locator(a.selector).press(a.key);
      else await page.keyboard.press(a.key);
      await page.waitForTimeout(150);
      break;
    }

    case "wait_for": {
      const a = arg || {};
      await page.waitForSelector(a.selector, {
        timeout: a.timeout ?? 5000,
        state: a.state || "visible",
      });
      break;
    }

    case "wait_for_url": {
      const a = typeof arg === "string" ? { url: arg } : (arg || {});
      await page.waitForURL(u => String(u).includes(a.url), { timeout: a.timeout ?? 5000 });
      break;
    }

    case "wait_ms": {
      await page.waitForTimeout(Number(arg) || 0);
      break;
    }

    case "banner": {
      const a = arg || {};
      await showBanner(page, a.tag || "SECTION", a.title || "", a.subtitle || "");
      break;
    }

    case "screenshot": {
      const a = (typeof arg === "object" && arg) ? arg : {};
      await recorder.record(page, a.label || label || "screenshot", a.observation || "");
      break;
    }

    case "eval": {
      // YAML strings can't carry real closures, so we accept the expression
      // as text. If the user wrote an arrow / function literal we invoke it;
      // otherwise we treat the text as a bare expression to evaluate.
      const expr = (typeof arg === "string" ? arg : (arg?.expression || "")).trim();
      const wrapped = /^(\(|function\b|async\b)/.test(expr) ? `(${expr})()` : `(${expr})`;
      let result;
      try { result = await page.evaluate(wrapped); } catch (e) { result = `ERR: ${e.message}`; }
      const obsRaw = typeof result === "string" ? result : JSON.stringify(result);
      await recorder.record(page, label || "eval", (obsRaw ?? "").slice(0, 800));
      break;
    }

    case "assert_selector_count": {
      const a = arg || {};
      const n = await page.locator(a.selector).count();
      if (a.min != null && n < a.min) throw new Error(`assert_selector_count(${a.selector}) min=${a.min} got=${n}`);
      if (a.max != null && n > a.max) throw new Error(`assert_selector_count(${a.selector}) max=${a.max} got=${n}`);
      if (a.equals != null && n !== a.equals) throw new Error(`assert_selector_count(${a.selector}) equals=${a.equals} got=${n}`);
      break;
    }

    case "assert_title_contains": {
      const t = await page.title();
      if (!t.includes(String(arg))) throw new Error(`title="${t}" does not contain "${arg}"`);
      break;
    }

    case "assert_url_contains": {
      const u = page.url();
      if (!u.includes(String(arg))) throw new Error(`url="${u}" does not contain "${arg}"`);
      break;
    }

    case "assert_text": {
      const a = arg || {};
      const t = (await page.locator(a.selector).textContent()) || "";
      if (a.contains != null && !t.includes(a.contains)) {
        throw new Error(`assert_text(${a.selector}) does not contain "${a.contains}"; got: ${t.slice(0, 120)}`);
      }
      if (a.equals != null && t.trim() !== String(a.equals).trim()) {
        throw new Error(`assert_text(${a.selector}) != "${a.equals}"; got: ${t.slice(0, 120)}`);
      }
      break;
    }

    case "assert_visible": {
      const a = normSelectorArg(arg);
      const visible = await page.locator(a.selector).first().isVisible();
      if (!visible) throw new Error(`assert_visible(${a.selector}) failed`);
      break;
    }

    case "assert_hidden": {
      const a = normSelectorArg(arg);
      const visible = await page.locator(a.selector).first().isVisible().catch(() => false);
      if (visible) throw new Error(`assert_hidden(${a.selector}) failed`);
      break;
    }

    default:
      throw new Error(`unknown step verb: ${verb}`);
  }
}

export async function runScenarioFile({ scenarioPath, runDir, sections, headless = true, slowMoOverride }) {
  const scenario = readYaml(scenarioPath);
  if (!scenario || !Array.isArray(scenario.sections)) {
    throw new Error(`scenario ${basename(scenarioPath)}: missing top-level "sections" array`);
  }

  const baseUrl   = scenario.base_url || "";
  const viewport  = scenario.viewport  || { width: 1280, height: 900 };
  const slowMoMs  = slowMoOverride ?? scenario.slow_mo_ms ?? 0;
  const ignore    = scenario.console_guard?.ignore || [];

  // Filter sections by id (if caller passed a subset).
  let chosen = scenario.sections;
  if (sections && sections.length) {
    const want = new Set(sections);
    chosen = scenario.sections.filter(s => want.has(s.id));
    const missing = sections.filter(id => !scenario.sections.some(s => s.id === id));
    if (missing.length) throw new Error(`unknown section id(s): ${missing.join(", ")}`);
  }

  // Persist section meta sidecar so the HTML report can render goal/scenario/expected cards.
  const fs = await import("node:fs");
  const metaPath = join(runDir, "meta-sections.json");
  const existing = (() => {
    try { return JSON.parse(fs.readFileSync(metaPath, "utf8").replace(/^﻿/, "")); } catch { return {}; }
  })();
  for (const s of scenario.sections) {
    existing[s.id] = {
      title: s.title || s.id,
      goal: s.goal || "",
      scenario: s.scenario || [],
      expected: s.expected || [],
    };
  }
  fs.writeFileSync(metaPath, JSON.stringify(existing, null, 2), "utf8");

  const recorder  = new StepRecorder(runDir);
  const videoDir  = join(runDir, "videos");
  const traceDir  = join(runDir, "trace");

  const browser = await chromium.launch({ headless, slowMo: slowMoMs });
  const results = [];
  let anyFailed = false;

  for (const section of chosen) {
    recorder.setSection(section.id);
    const sectionSlug = String(section.id).replace(/[^A-Za-z0-9._-]+/g, "-");
    const traceOut = join(traceDir, `section-${sectionSlug}.zip`);

    const context = await browser.newContext({
      viewport,
      recordVideo: { dir: videoDir, size: viewport },
    });
    await context.addInitScript(installHighlight);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    const consoleErrors = attachConsoleGuard(page, ignore);

    const ctx = { page, recorder, baseUrl };
    const failFast = section.fail_fast !== false;
    const stepErrors = [];
    const t0 = Date.now();

    try {
      console.log(`\n> section ${section.id} (${section.title || ""})`);
      for (let i = 0; i < (section.steps || []).length; i++) {
        const step = section.steps[i];
        try {
          await runStep(ctx, step);
        } catch (e) {
          const msg = `step #${i + 1} (${Object.keys(step).filter(k => k !== "label")[0]}): ${e.message}`;
          stepErrors.push(msg);
          try { await recorder.record(page, `fail-step-${i + 1}`, msg); } catch {}
          if (failFast) throw new Error(msg);
        }
      }
      if (consoleErrors.length) {
        throw new Error(`console errors:\n  - ${consoleErrors.join("\n  - ")}`);
      }
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      results.push({ id: section.id, ok: true, dtSec: Number(dt), errors: stepErrors });
      console.log(`< section ${section.id} PASS (${dt}s)`);
    } catch (e) {
      anyFailed = true;
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      results.push({ id: section.id, ok: false, dtSec: Number(dt), errors: [...stepErrors, e.message] });
      console.error(`< section ${section.id} FAIL (${dt}s): ${e.message}`);
      try { await recorder.record(page, "section-fail", e.message); } catch {}
    } finally {
      await context.tracing.stop({ path: traceOut });
      let videoPath = null;
      try { videoPath = page.video() ? await page.video().path() : null; } catch {}
      await context.close();
      if (videoPath && existsSync(videoPath)) {
        const target = join(videoDir, `section-${sectionSlug}.webm`);
        try { fs.renameSync(videoPath, target); } catch {}
      }
    }
  }

  await browser.close();
  return { results, anyFailed };
}
