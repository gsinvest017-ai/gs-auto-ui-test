# ui-replay-runner

Project-agnostic Playwright runner that turns YAML scenarios into traced runs
— screenshots, `trace.zip`, WebM video, and a single self-contained
`replay.html` report — usable as a drop-in front-end test artifact for any
web project.

Extracted from the [autogo](https://github.com/) dashboard autotest harness:
the highlight overlay, chapter-banner cards, step recorder, trace + WebM
plumbing, and HTML report are kept; the SUT-specific `runSmoke / runPicker /
…` handlers are replaced by a YAML scenario engine so the same machinery
drives any web app.

## What you get

- **Per-action visual highlights** in the recorded video — red ring on click, cyan on type, green on hover, with floating labels. Necessary because headless Chromium has no cursor.
- **Chapter banners** between sections so a human reviewing the long-form WebM knows where in the test plan they are.
- **Per-step screenshots + JSON sidecars** under `steps/NNN-<slug>.{png,json}`, numbered globally across the run.
- **Playwright traces** per section (`trace/section-<id>.zip`) and a single offline `replay.html` that links to everything.
- **Console-error guard** with per-scenario regex ignore list (favicons, dev-tools chatter, etc.).
- **Cross-platform run-dir lifecycle** — no PowerShell needed, runs the same on Linux/macOS/Windows.

## Install

```bash
git clone <this-repo> ui-replay-runner
cd ui-replay-runner
npm install
npx playwright install chromium
```

If you publish this to a private npm registry / GitHub Packages, downstream
projects can:

```bash
npm install --save-dev ui-replay-runner playwright
npx playwright install chromium
```

## Quickstart

```bash
node bin/ui-replay.mjs run scenarios/example.yaml
```

This runs the bundled TodoMVC demo. After ~30 s you get:

```
test-artifacts/replays/20260518-115930/
├── meta.json
├── meta-sections.json
├── steps/
├── trace/
├── videos/
└── replay.html      ← open this in a browser
```

## Write your own scenario

Create `scenarios/my-app.yaml`:

```yaml
name: my-app
base_url: http://localhost:3000
viewport: { width: 1280, height: 800 }

sections:
  - id: login
    title: §1 Login
    goal: Valid credentials land on /dashboard
    steps:
      - banner: { tag: SECTION 1, title: Login }
      - goto: /login
      - fill: { selector: "#email",    value: "user@example.com" }
      - fill: { selector: "#password", value: "hunter2" }
      - click: "#submit"
      - wait_for_url: /dashboard
      - assert_visible: "[data-testid=welcome]"
```

Then run it:

```bash
node bin/ui-replay.mjs run scenarios/my-app.yaml
```

Full verb reference: [`docs/scenario-schema.md`](docs/scenario-schema.md).
Output layout: [`docs/output-format.md`](docs/output-format.md).

## CLI

```
ui-replay init   [--label foo]                    create new run dir, print path
ui-replay run    <scenario.yaml>                  run scenario; auto-inits a run if no --run-dir
                 [--run-dir <dir>] [--sections id,id]
                 [--headed] [--slow-mo-ms N] [--label foo]
ui-replay report [--run-dir <dir>]                rebuild replay.html
ui-replay prune  [--keep 5] [--keep-label regex]  trim old runs
```

Setting `UI_REPLAY_RUN` in the environment is equivalent to `--run-dir`. The
`init` command prints the dir to stdout so you can capture it:

```bash
export UI_REPLAY_RUN=$(node bin/ui-replay.mjs init --label smoke)
node bin/ui-replay.mjs run scenarios/my-app.yaml
node bin/ui-replay.mjs run scenarios/my-app-extras.yaml   # adds onto the same run
node bin/ui-replay.mjs report
```

## Architecture

```
bin/ui-replay.mjs         CLI: init / run / report / prune
lib/scenario.js           YAML loader + step verb dispatcher (the engine)
lib/actions.js            uiClick / uiFill / uiCheck / uiHover / uiSelect / showBanner
lib/highlight.js          installHighlight() — injected via context.addInitScript
lib/record.js             StepRecorder — screenshot + JSON sidecar per step
lib/console-guard.js      attachConsoleGuard(page, ignore[])
lib/run-dir.js            initRun / finishRun / pruneRuns (cross-platform)
lib/report.js             buildReport(runDir) → replay.html
scenarios/example.yaml    reference scenario (TodoMVC)
docs/scenario-schema.md   verb reference
docs/output-format.md     run-dir layout reference
```

The engine has no opinion about your SUT. Anything you can write with
Playwright's locator API can be expressed as YAML steps; if the YAML verbs
are too restrictive for a particular case, use `eval:` to drop into raw
`page.evaluate` for that one step.

## Non-goals

- **No Claude / MCP integration.** This is a headless runner — drive it from CI, npm scripts, or whatever. Claude can write and run scenarios via Bash, but the runner itself doesn't know Claude exists.
- **No assertion DSL beyond the verbs above.** Reach for `eval:` if you need something exotic; if you find yourself doing that a lot, file an issue.
- **No retry / flake-quarantine logic.** A failed section is a failed section. CI flake handling is your test harness's job, not this artifact's.
