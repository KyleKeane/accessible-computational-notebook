# Refactor Plan: Accessible Computational Notebook

This document is the comprehensive assessment of the original prototype (PR #1,
branch `claude/notebook-app-electron-01XUnU9bUatCAtrrbYrUPjoh`) and the plan for
the ground-up rebuild that replaces it. It explains what was wrong, what was
worth keeping, the new architecture, and the milestones beyond this rebuild.

## 1. Goal

A computational notebook (in the spirit of Jupyter and Wolfram notebooks) that
is **screen-reader-first and keyboard-only by design**, with:

- Persistent, modular language kernels (Python and JavaScript to start).
- Real file interoperability (Jupyter `.ipynb` format, not a private JSON).
- An architecture where the core is testable without launching a GUI.

## 2. Assessment of the prototype

The prototype (≈5,100 lines) demonstrated the right product idea but could not
be evolved into a reliable tool. Problems, in order of severity:

### 2.1 Fatal

1. **`vm2` dependency.** The JavaScript sandbox was built on `vm2`, which was
   discontinued in 2023 after unpatchable sandbox-escape vulnerabilities
   (CVE-2023-37466 et al.). It must not be installed at all.
2. **Persistence never worked.** `main.js` constructed a *new*
   `InterpreterManager` — and therefore a new VM and a freshly spawned Python
   REPL — on **every** `execute-code` IPC call. The headline feature
   ("interpreters maintain state between executions") was structurally
   impossible; every cell ran in a blank session, and orphaned Python processes
   accumulated.
3. **Python integration by REPL scraping.** Code was piped into `python3 -i`,
   wrapped in a `try:` block by indenting every line (which breaks blank-line
   separated blocks in the REPL), completion was detected by grepping stdout
   for a `__EXEC_<timestamp>__` marker, `>>> ` was stripped from output with a
   regex (corrupting any legitimate output containing it), errors raced a 5 s
   timeout, and a new `checkOutput` listener leaked on every execution.

### 2.2 Architectural

4. **Two sources of truth.** The renderer kept cells in a JS array mirrored in
   the DOM; the main process kept a *separate* `NotebookManager` state synced
   ad-hoc via `notebook-sync`. The two drifted by design. Cells were
   identified by **index** everywhere, so every insert/delete invalidated
   closures already wired into DOM buttons (`runCell(index)` captured at
   creation time) — stale-index bugs were guaranteed.
5. **Duplicated APIs.** A renderer-side "FrontEnd token" API and a main-side
   "Notebook API" overlapped ~80 % with different semantics (e.g. three
   different meanings of a cell `position` argument).
6. **No file story.** "Save" generated a browser download with a
   timestamp-based filename into a private JSON shape; there was no Open, no
   dirty tracking, no native dialogs, and no interop with any other tool.
7. **Window/state lifecycle confusion.** A singleton `NotebookManager` with an
   `activeNotebook` pointer plus a module-level `mainWindow` variable that gets
   overwritten — multiple windows would corrupt each other.

### 2.3 Accessibility (the project's core mission)

8. **`role="application"` on the root** disables screen readers' browse/virtual
   mode for the entire app — the single most damaging ARIA mistake for this
   audience.
9. **Fake screen-reader detection** via user-agent sniffing for "NVDA"/"JAWS"
   (these never appear in user agents) and `prefers-reduced-motion` as a proxy.
   Behavior must never branch on screen-reader detection.
10. **A global `Escape` handler that blurs whatever has focus** ("Focus
    cleared") — fighting the user's screen reader instead of cooperating.
11. **Announcement spam**: queued announcements with `setTimeout` pacing,
    `aria-live` regions duplicated on the status bar, the announcer, *and*
    every cell output.
12. **No native menus.** Everything hung off custom shortcuts (several of
    which, like `Alt+C`/`Alt+M`, collide with menu mnemonics and IME
    conventions), so features were undiscoverable without reading the docs.

### 2.4 Engineering hygiene

13. **Zero tests, no CI, no lint.** Nothing was executable headlessly — all
    logic was welded to Electron or the DOM.
14. **Unused native dependency** (`node-pty`) that makes `npm install` fail on
    machines without build toolchains.
15. Hand-rolled 20-line markdown "parser"; docs that overstate what the code
    does (claimed WCAG compliance, screen-reader testing, sandboxing).

### 2.5 What is worth keeping

- The product vision and feature set (modal cell navigation, run-and-advance,
  describe-cell command, per-cell announcements).
- The keyboard-shortcut vocabulary that matches Jupyter (`Shift+Enter`,
  `Ctrl+Enter`, `Alt+Enter`).
- The intent of a backend "notebook manipulation API" for automation
  (re-planned as Milestone 2 on top of the kernel protocol).

Verdict: **rebuild from scratch**, carrying over the vision, not the code.

## 3. New architecture

```
┌──────────────────────────── Electron main process ────────────────────────────┐
│  main.js          window/lifecycle, dialogs, title = "name — modified"        │
│  menu.js          native menu bar: every command + accelerator lives here     │
│  ipc.js           thin command router: renderer ⇄ store/kernels/files         │
│                                                                               │
│  src/core/  (pure Node, no Electron — unit-tested directly)                   │
│    notebook-store.js   single source of truth; id-based cells; EventEmitter   │
│    ipynb.js            Jupyter nbformat 4 read/write (lossless pass-through)  │
│    markdown.js         small, escaped-by-construction markdown renderer       │
│                                                                               │
│  src/main/kernels/                                                            │
│    kernel-manager.js   one persistent kernel per language; lazy start;        │
│                        interrupt/restart                                      │
│    process-kernel.js   generic child-process client, JSON-lines protocol      │
│    runners/js-runner.mjs       node:vm persistent context (plain Node)        │
│    runners/python-runner.py    exec/eval in persistent namespace (stdlib)     │
└───────────────────────────────────────────────────────────────────────────────┘
            ▲ contextBridge (preload.cjs): commands in, state events out
┌────────────────────────────── renderer (view only) ───────────────────────────┐
│  view.js        renders cells from store events; DOM keyed by cell id         │
│  keyboard.js    Escape/Enter/Arrow cell navigation; F6 region cycling         │
│  announcer.js   ONE polite + ONE assertive live region, rate-limited          │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Single source of truth

`NotebookStore` lives in the main process. Cells have stable ids; **no index
is ever stored or captured**. The renderer holds no model state: it issues
commands (`insert-cell`, `update-source`, `run-cell`, …) and re-renders from
granular store events (`cell-inserted`, `cell-outputs-changed`, …). The store
also tracks the active cell id (reported by the renderer on focus change) so
that native menu items can act on "the current cell" without asking the DOM.

### 3.2 Kernels: a real protocol instead of REPL scraping

Each kernel is a plain child process speaking **JSON lines** on stdin/stdout:

```
→ {"id": 1, "type": "execute", "code": "x = 1\nx + 1"}
← {"id": 1, "type": "result", "status": "ok",
   "outputs": [{"type": "execute_result", "text": "2"}],
   "executionCount": 1}
```

- **Python** (`python-runner.py`, stdlib only): parses the cell with `ast`; if
  the last statement is an expression its `repr()` is returned as
  `execute_result` (Jupyter semantics). User `stdout`/`stderr` are redirected
  during execution so they can never corrupt the protocol stream. Errors
  return structured `ename`/`evalue`/`traceback`. The namespace persists for
  the kernel's lifetime. Interrupt = `SIGINT` → `KeyboardInterrupt`.
- **JavaScript** (`js-runner.mjs`): a persistent `node:vm` context in a child
  process (crash/oom kills the child, not the app — this replaces `vm2`;
  note: this is *isolation for robustness*, and the docs say so honestly —
  notebook code execution is trusted, exactly as in Jupyter). `console.*` is
  captured as streams; promise results are awaited; top-level `await` is
  supported by async-wrapping on demand. Interrupt = restart (state loss is
  announced).

Because runners are plain processes, **the full execution path is integration-
tested with `node --test` and `python3` — no Electron, no display needed.**

### 3.3 File format: `.ipynb`

Notebooks are nbformat 4 documents. Code/markdown/raw cells and
stream/execute_result/error outputs map directly; unknown output types
(e.g. `display_data` images) are preserved verbatim through load/save and
rendered as a described placeholder until Milestone 3. This makes the app a
citizen of the Jupyter ecosystem instead of an island.

### 3.4 Accessibility design (rules, not vibes)

- **The native menu bar is the backbone.** Every feature is a menu item with
  an accelerator — discoverable, screen-reader-perfect, and self-documenting.
  No custom shortcut exists that isn't also in a menu.
- **Standard document semantics.** No `role="application"`. The notebook is a
  `main` landmark; each cell is a labelled `section` ("Code cell 2 of 5");
  editors are labelled `textarea`s; outputs are labelled groups.
- **No screen-reader detection, ever.** One behavior for everyone.
- **Exactly two live regions** (polite for status, assertive for errors),
  rate-limited; cell outputs are *not* live — completion is announced once
  ("Cell 2 finished: 3 lines of output") and the output is then navigable.
- **Modal navigation like Jupyter**: `Escape` moves from editor to the cell
  container, arrows move between cells, `Enter` re-enters the editor;
  `F6` cycles toolbar / notebook / status bar. On-demand speech:
  describe cell, read output, kernel status.
- **Shortcut hygiene**: no `Alt+letter` (menu mnemonics), no `Insert`/`CapsLock`
  combos (screen-reader modifiers), Jupyter's `Shift/Ctrl/Alt+Enter` kept.
- **Honest claims**: docs state what is implemented and what is untested with
  which screen reader, with a testing checklist (NVDA, JAWS, VoiceOver, Orca).

### 3.5 Engineering

- **Zero runtime npm dependencies; one dev dependency (`electron`).**
  No `vm2`, no `node-pty`, no bundler. `npm install` is trivial everywhere.
- **Tests with `node:test`** (built in): store, ipynb round-trip, markdown,
  and live integration tests of both kernel runners.
- **CI** (GitHub Actions): runs the whole suite with Node + Python on every
  push/PR — no npm install step required.
- Modern ESM throughout (Electron ≥ 28 supports ESM main); preload stays CJS
  as Electron requires.

## 4. Milestones

### Milestone 1 — this rebuild (done in this PR)

Store + ipynb + markdown core with tests; persistent Python and JS kernels
with protocol-level integration tests; Electron shell with native menus, file
open/save/save-as/dirty tracking; accessible renderer (cells, modal keyboard
navigation, two live regions, help dialog); docs (README, ARCHITECTURE,
ACCESSIBILITY); CI.

### Milestone 2 — interaction depth (largely done)

- [x] Streaming output: kernels emit `stream` messages while a cell runs;
  the store coalesces chunks and the cell updates live.
- [x] Notebook automation API exposed *inside* kernels — the old "FrontEnd
  tokens" idea, rebuilt on the protocol: `notebook.insert_cell(…)` etc. from
  Python (synchronous) and `await notebook.insertCell(…)` from JavaScript,
  tested end-to-end through real kernel processes.
- [x] Cell-level undo/redo of structural operations (insert, delete, move,
  type change) on `Ctrl+Alt+Z` / `Ctrl+Alt+Y`; text editing stays on the
  editor's native undo.
- [x] Find / replace across cells (`Ctrl+F`, non-modal dialog, announced
  matches: "Match 2 of 7: cell 3, line 4").
- [ ] Execution timeout policy / settings surface (interrupt and restart are
  already in the Kernel menu).

### Milestone 3 — rich content & distribution

- Rich outputs: images (with an alt-text prompt flow), HTML tables rendered as
  real `<table>` so screen readers get row/column navigation.
- Optional syntax-aware editor (evaluate CodeMirror 6 accessibility; textarea
  remains the fallback).
- Additional kernels (R, Julia) via the same runner contract.
- Packaging with electron-builder; signed releases.

### Milestone 4 — community

- Screen-reader user testing rounds (NVDA, JAWS, VoiceOver, Orca) tracked as
  issues; WCAG 2.2 AA self-audit; CONTRIBUTING guide with an accessibility
  acceptance checklist for every PR.

## 5. Disposition of the old work

PR #1 should be **closed without merging**; this plan and rebuild supersede
it. The prototype remains available on its branch for reference.
