# Architecture

## Overview

```
┌─────────────────────────── Electron main process ───────────────────────────┐
│ src/main/main.js      window lifecycle, native dialogs, open/save, title    │
│ src/main/menu.js      native menu bar — every command + accelerator         │
│ src/main/commands.js  one implementation behind menu items AND renderer     │
│ src/main/ipc.js       command router + store-event forwarding               │
│                                                                             │
│ src/core/  (pure Node, no Electron imports — tested headlessly)             │
│   notebook-store.js   single source of truth; id-based cells; events        │
│   ipynb.js            nbformat 4 read/write, lossless pass-through          │
│   markdown.js         escaped-by-construction markdown renderer             │
│                                                                             │
│ src/main/kernels/                                                           │
│   kernel-manager.js   one persistent kernel per language, lazy start        │
│   process-kernel.js   child-process client for the JSON-lines protocol      │
│   runners/js-runner.mjs        persistent node:vm context                   │
│   runners/python-runner.py     persistent namespace, stdlib only            │
│   runners/bash-runner.py       bash -c per cell + state snapshots (POSIX)   │
└─────────────────────────────────────────────────────────────────────────────┘
                  ▲ preload.cjs: command(name, args) ⇅ onEvent(channel, payload)
┌──────────────────────────────── renderer ───────────────────────────────────┐
│ src/renderer/app.js        bootstrap + toolbar wiring                       │
│ src/renderer/view.js       DOM keyed by cell id, rendered from store events │
│ src/renderer/keyboard.js   focus-dependent keys (arrows, Enter/Escape, F6)  │
│ src/renderer/announcer.js  the only two live regions in the app             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Principles

1. **One source of truth.** All notebook state lives in `NotebookStore` in
   the main process. The renderer holds no model — it sends commands and
   re-renders from granular events (`cell-inserted`, `cell-outputs-changed`,
   …). Cells are addressed by stable ids; no code ever stores an index.

2. **One implementation per command.** `commands.js` is called by both the
   native menu and renderer-initiated actions (toolbar, IPC), so behavior and
   announcements are identical regardless of how a command is invoked.

3. **The core never imports Electron.** Everything in `src/core/` and the
   whole kernel layer run under plain Node, which is why the test suite
   covers real code execution without a display.

4. **Kernels are processes, not libraries.** Each kernel is a child process
   speaking JSON lines on stdin/stdout. Crashes are contained, "restart
   kernel" is `kill` + `spawn`, and interrupt is `SIGINT`.

## Kernel protocol

Messages are JSON lines, correlated by `id`. While a cell runs, the kernel
streams output as it is produced; the final `result` carries only
results/errors:

```jsonc
// main → kernel
{"id": 3, "type": "execute", "code": "print('hi')\nx + 1"}

// kernel → main (zero or more, during execution)
{"id": 3, "type": "stream", "name": "stdout", "text": "hi\n"}

// kernel → main (exactly one)
{"id": 3, "type": "result", "status": "ok",
 "outputs": [{"type": "execute_result", "text": "2"}],
 "executionCount": 3}
```

While a cell runs, the kernel may also call back into the app — this powers
the `notebook` automation object available to user code:

```jsonc
// kernel → main
{"type": "api", "apiId": 1, "method": "insert_cell",
 "args": {"source": "x = 1", "type": "code", "index": null}}

// main → kernel
{"type": "api-result", "apiId": 1, "value": {"index": 2, "id": "…"}, "error": null}
```

The main-process side of the API is `src/main/kernels/notebook-api.js`
(methods: `cell_count`, `get_cells`, `get_source`, `set_source`,
`insert_cell`, `delete_cell`; indices are 0-based). It is pure Node, so the
full loop — user code in a real kernel mutating a real store — is covered by
`test/notebook-api.test.js`.

Output objects (mirroring nbformat):

| type | fields | meaning |
| --- | --- | --- |
| `stream` | `name` (`stdout`/`stderr`), `text` | captured print output |
| `execute_result` | `text` | repr/inspect of the trailing expression |
| `error` | `ename`, `evalue`, `traceback` | structured exception |

User output can never corrupt the protocol: both runners capture user
stdout/stderr during execution and emit them inside the JSON response.

### Adding a kernel

1. Write a runner (any language) that reads one JSON message per line on
   stdin and writes one `result` line per `execute` to stdout, keeping its
   evaluation state between messages.
2. Register it in `KERNEL_SPECS` in `src/main/kernels/kernel-manager.js`
   (display name, command, args).
3. Add an integration test in `test/kernels.test.js` following the existing
   ones — persistence, streams, trailing expression, structured errors.

## File format

Notebooks are Jupyter nbformat 4 documents (`.ipynb`). `src/core/ipynb.js`
maps code/markdown/raw cells and stream/execute_result/error outputs
directly; any output type it doesn't understand (e.g. `display_data` images)
is carried through load → save untouched and shown as a described
placeholder in the UI.

## Renderer contract

The preload script exposes exactly three functions:

```js
window.notebook.getState()           // full snapshot, used on (re)load
window.notebook.command(name, args)  // all mutations and actions
window.notebook.onEvent(handler)     // granular store + app events
```

The renderer applies events to the DOM (insert/remove/reorder nodes keyed by
cell id) and recomputes positional labels ("Code cell 2 of 5") after any
structural change. A full re-render happens only on `notebook-replaced`
(new/open/load).

## Testing

`npm test` runs `node --test`:

- `test/notebook-store.test.js` — state invariants, events, streaming
  output coalescing, undo/redo of structural operations
- `test/ipynb.test.js` — parse/serialize, Jupyter-written sample,
  round-trips, error cases
- `test/markdown.test.js` — rendering and escaping (including injection
  attempts)
- `test/search.test.js` — find/replace logic shared with the find dialog
- `test/kernels.test.js` — live child-process integration tests of both
  runners: persistence, streams, errors, interrupt, restart, stop
- `test/notebook-api.test.js` — the in-kernel automation API, end to end
  through real kernel processes against a real store

CI (`.github/workflows/ci.yml`) runs the same suite on every push and PR.
The Electron shell (`main.js`, menu, renderer) is deliberately thin; verify
it manually with `npm start` when touching it.
