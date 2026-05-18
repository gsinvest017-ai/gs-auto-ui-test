#!/usr/bin/env node
// ui-replay — project-agnostic Playwright runner driven by YAML scenarios.
//
// Commands:
//   ui-replay init   [--label foo]            create test-artifacts/replays/<ts>[-foo]/, print path
//   ui-replay run    <scenario.yaml> [opts]   run a scenario; auto-inits a run if no --run-dir
//   ui-replay report [--run-dir <dir>]        build replay.html in run dir
//   ui-replay prune  [--keep N] [--keep-label re]  trim old run dirs
//
// Common flags:
//   --run-dir <path>     explicit run dir (falls back to $UI_REPLAY_RUN)
//   --label  <text>      run-id label suffix (init only)
//   --sections id,id     subset of sections by id (run only)
//   --headed             show browser (default: headless)
//   --slow-mo-ms <n>     per-action delay (overrides scenario)
//   --replays-root <dir> custom <root>/test-artifacts/replays parent
//
// Exit codes: 0 ok, 1 section failures, 2 bad CLI / missing file.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { initRun, finishRun, pruneRuns } from "../lib/run-dir.js";
import { runScenarioFile } from "../lib/scenario.js";
import { buildReport } from "../lib/report.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) args[key] = true;
      else { args[key] = next; i++; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function resolveRunDir(args) {
  return args["run-dir"] || process.env.UI_REPLAY_RUN || null;
}

function help(code = 0) {
  console.log(`ui-replay — Playwright YAML-scenario runner

usage:
  ui-replay init   [--label <text>] [--replays-root <dir>]
  ui-replay run    <scenario.yaml> [--run-dir <dir>] [--sections id,id]
                                   [--headed] [--slow-mo-ms <n>] [--label <text>]
  ui-replay report [--run-dir <dir>]
  ui-replay prune  [--replays-root <dir>] [--keep <N>] [--keep-label <regex>]

env:
  UI_REPLAY_RUN  current run dir (set automatically by 'run' if not provided)
`);
  process.exit(code);
}

async function cmdInit(args) {
  const runDir = initRun({
    label: args.label && args.label !== true ? args.label : "",
    replaysRoot: args["replays-root"],
  });
  // Print path on stdout so callers can capture it
  console.log(runDir);
}

async function cmdRun(args) {
  const scenarioPath = args._[1];
  if (!scenarioPath) { console.error("missing scenario file"); process.exit(2); }
  const absPath = resolve(scenarioPath);
  if (!existsSync(absPath)) { console.error(`scenario file not found: ${absPath}`); process.exit(2); }

  let runDir = resolveRunDir(args);
  let createdRunHere = false;
  if (!runDir) {
    runDir = initRun({
      label: args.label && args.label !== true ? args.label : "",
      replaysRoot: args["replays-root"],
    });
    createdRunHere = true;
    console.log(`[init] run dir: ${runDir}`);
  } else if (!existsSync(runDir)) {
    console.error(`--run-dir not found: ${runDir}`);
    process.exit(2);
  }

  const sections = args.sections && args.sections !== true
    ? String(args.sections).split(",").map(s => s.trim()).filter(Boolean)
    : null;
  const slowMo = args["slow-mo-ms"] && args["slow-mo-ms"] !== true
    ? Number(args["slow-mo-ms"])
    : undefined;

  const { results, anyFailed } = await runScenarioFile({
    scenarioPath: absPath,
    runDir,
    sections,
    headless: !args.headed,
    slowMoOverride: slowMo,
  });

  // Always finalize + build report so users get artifacts even on partial failure
  finishRun({ runDir });
  const r = buildReport(runDir);
  console.log(`\nwrote ${r.outPath}`);
  console.log(`  steps: ${r.stepCount}  traces: ${r.traceCount}  videos: ${r.videoCount}`);

  console.log("\nsummary:");
  for (const s of results) {
    const tag = s.ok ? "PASS" : "FAIL";
    console.log(`  ${s.id.padEnd(20)} ${tag}  (${s.dtSec}s)`);
    if (!s.ok) for (const e of s.errors) console.log(`    - ${e}`);
  }
  if (createdRunHere) console.log(`\nrun dir: ${runDir}`);
  process.exit(anyFailed ? 1 : 0);
}

async function cmdReport(args) {
  const runDir = resolveRunDir(args);
  if (!runDir) { console.error("no run dir (pass --run-dir or set UI_REPLAY_RUN)"); process.exit(2); }
  if (!existsSync(runDir)) { console.error(`run dir not found: ${runDir}`); process.exit(2); }
  finishRun({ runDir });
  const r = buildReport(runDir);
  console.log(`wrote ${r.outPath}`);
  console.log(`  steps: ${r.stepCount}  traces: ${r.traceCount}  videos: ${r.videoCount}`);
}

async function cmdPrune(args) {
  const replaysRoot = args["replays-root"] || join(process.cwd(), "test-artifacts", "replays");
  const keepRecent = args.keep && args.keep !== true ? Number(args.keep) : 5;
  const keepLabels = args["keep-label"] && args["keep-label"] !== true ? [args["keep-label"]] : [];
  const { removed, kept } = pruneRuns({ replaysRoot, keepRecent, keepLabels });
  console.log(`prune: kept ${kept.length}, removed ${removed.length}`);
  for (const k of kept) console.log(`  keep   ${k}`);
  for (const r of removed) console.log(`  remove ${r}`);
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
try {
  switch (cmd) {
    case "init":   await cmdInit(args); break;
    case "run":    await cmdRun(args); break;
    case "report": await cmdReport(args); break;
    case "prune":  await cmdPrune(args); break;
    case undefined:
    case "help":
    case "--help":
    case "-h":     help(0); break;
    default:
      console.error(`unknown command: ${cmd}`);
      help(2);
  }
} catch (e) {
  console.error(`fatal: ${e.message}`);
  process.exit(1);
}
