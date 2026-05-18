# Scenario schema

A scenario file is YAML with a top-level config block plus a list of
sections. Each section is one independent browser context — fresh cookies,
fresh trace.zip, fresh WebM.

## Top level

| key | type | default | notes |
|---|---|---|---|
| `name` | string | — | scenario name; surfaced in logs |
| `base_url` | string | `""` | prefixed onto every relative `goto:` path |
| `viewport` | `{width, height}` | `{1280, 900}` | passed to every browser context |
| `slow_mo_ms` | number | `0` | per-action delay (Playwright `slowMo`) |
| `console_guard.ignore` | string[] | `[]` | regex patterns that suppress console errors |
| `sections` | section[] | — | required, runs in declared order |

## Section

| key | type | default | notes |
|---|---|---|---|
| `id` | string | — | required, must be unique; becomes filename slug |
| `title` | string | id | rendered above the section's video in replay.html |
| `goal` | string | `""` | one-sentence purpose; rendered in replay.html |
| `scenario` | string[] | `[]` | human-readable bullet list — what the test does |
| `expected` | string[] | `[]` | human-readable bullet list — pass criteria |
| `fail_fast` | bool | `true` | if false, collect step errors and keep going |
| `steps` | step[] | — | required, ordered list of verbs |

## Step verbs

Each step is an object with **exactly one** verb key (plus optional `label`).

### Navigation

| verb | shape | notes |
|---|---|---|
| `goto` | `"/path"` or `{url, wait_until}` | `wait_until` defaults to `domcontentloaded` |
| `wait_for_url` | `"/foo"` or `{url, timeout}` | substring match |

### User actions

All of these paint a coloured ring on the page before the action so the recorded WebM shows where the cursor went.

| verb | shape | notes |
|---|---|---|
| `click` | `"#sel"` or `{selector, nth, label}` | red ring |
| `fill` | `{selector, value}` | cyan ring |
| `hover` | `"#sel"` | green ring |
| `select` | `{selector, value}` | for `<select>` |
| `check` | `"#sel"` | swallows errors if already checked |
| `press` | `{selector?, key}` | dispatches to the element if `selector` given, else page-level |

### Waits

| verb | shape | notes |
|---|---|---|
| `wait_for` | `{selector, timeout?, state?}` | `state` ∈ `attached/visible/hidden`, default `visible` |
| `wait_ms` | number | hard sleep |

### Diagnostics

| verb | shape | notes |
|---|---|---|
| `banner` | `{tag, title, subtitle?}` | full-width chapter card, ~2.7s on screen |
| `screenshot` | `{label, observation?}` | writes one numbered .png + .json to `steps/` |
| `eval` | `"() => expr"` or `{expression}` | result stringified into step observation |

### Assertions (throw on fail)

| verb | shape | notes |
|---|---|---|
| `assert_selector_count` | `{selector, min?, max?, equals?}` | at least one of the bounds must be set |
| `assert_title_contains` | string | substring match on `document.title` |
| `assert_url_contains` | string | substring match on `page.url()` |
| `assert_text` | `{selector, contains?, equals?}` | reads `textContent` |
| `assert_visible` | `"#sel"` | uses Playwright `isVisible()` on first match |
| `assert_hidden` | `"#sel"` | inverse |

## Special behaviours

- The console-error guard is **per section** and fires at the end of `steps[]`. Anything that slipped past `ignore` becomes a section failure.
- A failing step inside a `fail_fast: true` section still records a `fail-step-N` sidecar before propagating, so the trace stays useful.
- Every step counts upward across sections in the same run dir, so the `steps/NNN-*` files form a single global timeline.
