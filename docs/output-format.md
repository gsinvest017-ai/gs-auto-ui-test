# Output layout

Every `ui-replay run` writes a self-contained run dir under
`<project>/test-artifacts/replays/<timestamp>[-<label>]/`. Folder is
the unit of pruning — delete the directory and everything is gone.

```
<run-dir>/
├── meta.json            # run_id, commit, branch, started_at/finished_at, total_bytes, sections[]
├── meta-sections.json   # per-section title/goal/scenario/expected (drives replay.html cards)
├── steps/
│   ├── 001-<slug>.png   # full-viewport screenshot
│   ├── 001-<slug>.json  # { index, label, observation, section, ts, screenshot }
│   └── …                # numbering is global across all sections in this run
├── trace/
│   └── section-<id>.zip # open with `npx playwright show-trace trace/section-<id>.zip`
├── videos/
│   └── section-<id>.webm  # WebM @ viewport size, low bitrate (Playwright default)
└── replay.html          # offline report — links to all of the above relatively
```

## `meta.json`

```json
{
  "run_id": "20260518-115930-smoke",
  "label": "smoke",
  "started_at": "2026-05-18T11:59:30.123Z",
  "finished_at": "2026-05-18T12:01:15.881Z",
  "commit": "abc1234",
  "branch": "main",
  "sections": ["smoke", "add-todo", "complete-todo"],
  "total_bytes": 18432109
}
```

`commit` / `branch` come from `git -C <projectRoot> rev-parse`. If the project
is not a git repo both stay `null`.

## Step sidecar

```json
{
  "index": 5,
  "label": "after-add",
  "observation": "one item appears",
  "section": "add-todo",
  "ts": "2026-05-18T11:59:42.044Z",
  "screenshot": "steps/005-after-add.png"
}
```

## `replay.html`

- Pure relative paths to siblings — no inlining, so the file stays small.
- Group steps by section, render the goal/scenario/expected card above each group.
- Filter buttons let you isolate one section's timeline.
- Each section's `.webm` ships with a speed selector (default 2×).
- Trace zips link out; the hint shows the `npx playwright show-trace` command.

## Pruning

`ui-replay prune` keeps the N most-recent run dirs (`--keep`, default 5) plus
anything whose name matches `--keep-label <regex>`. Everything else is deleted
recursively. There is no incremental cleanup — runs are atomic units.
