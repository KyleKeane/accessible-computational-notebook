# Changelog

## 1.0.0

First production release. A complete rebuild of the original prototype
(assessment and plan in `docs/REFACTOR_PLAN.md`).

### The notebook

- Persistent kernels — Python 3, JavaScript (Node), Bash — as child
  processes speaking a JSON-lines protocol; streaming output; structured
  errors; interrupt, restart, and per-cell time limits.
- Jupyter `.ipynb` files with lossless interop (cell metadata, attachments,
  notebook metadata, rich outputs); autosave and crash recovery; exports to
  script (Jupytext percent), standalone accessible HTML, and a plain-text
  narrative.
- Cell editing parity: insert/delete/move/cut/copy/paste/split/merge,
  cell-operation undo/redo, find and replace (`F3` to repeat),
  collapsible sections, initialization cells.

### The audio-first workflow

- Every command is a native menu item with an accelerator; `F1` lists all
  shortcuts; two rate-limited live regions (plus one per dialog).
- Minimal speech: fast cells skip "Running…"; focus-moving commands
  announce only the event; long output is summarized with full reading on
  demand (`Ctrl+Shift+O`); long runs announce progress every 30 s and
  report their duration.
- Orientation on demand: describe cell (`Ctrl+Shift+I`), describe notebook
  (`Ctrl+Shift+N`), kernel status (`Ctrl+Shift+K`), announcement history
  (`Ctrl+Shift+L`).
- Narrative mode (`Ctrl+Shift+E`): the whole notebook as one readable
  story — prose, code steps, results — navigable by headings.
- Rapid iteration: Quick Evaluate (`Ctrl+E`), Run Selection (`F9`),
  `_` / `Out[n]` history, `?symbol` documentation cells.
- Kernel intelligence everywhere: variable inspector (`Ctrl+Shift+W`),
  completion (`Ctrl+Space`), symbol docs (`Ctrl+Shift+U`).
- Accessible rich content: image outputs with a saved description flow
  (`Ctrl+Shift+G`); HTML tables with real table semantics.

### Engineering

- Zero runtime npm dependencies; 113 headless tests including live kernel
  integration tests; CI on every push; three adversarial GUI desk-check
  reviews (19 bugs found and fixed before release).
