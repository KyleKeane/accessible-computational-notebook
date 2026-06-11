# Accessible Computational Notebook

A computational notebook — in the spirit of Jupyter and Wolfram notebooks —
designed **screen-reader-first and keyboard-only**. Built with Electron, with
persistent Python and JavaScript kernels and native `.ipynb` file support.

## Why

Mainstream notebook interfaces are hard to use with a screen reader: focus
jumps unpredictably, output appears silently, and core commands are
mouse-first. This project flips the priorities: every feature is a native
menu item with a keyboard accelerator, every action announces its result, and
the document structure is plain semantic HTML that browse mode understands.

## Requirements

- Node.js 20+
- Python 3.8+ on your `PATH` (for the Python kernel)

## Install and run

```bash
git clone https://github.com/KyleKeane/accessible-computational-notebook.git
cd accessible-computational-notebook
npm install        # installs Electron, the only dependency
npm start
```

## Quick start

1. The app opens with one empty code cell focused. Type some Python.
2. Press `Shift+Enter` to run it and move on. Output is announced when the
   cell finishes, and you can press `Ctrl+Shift+O` any time to hear the
   current cell's output again.
3. Press `Alt` (or `F10`) to explore the menus — **everything the app can do
   is in the menu bar with its shortcut listed**, so you never need a
   reference card. `F1` shows the shortcut summary.
4. `Ctrl+S` saves a standard Jupyter `.ipynb` file that opens in JupyterLab,
   VS Code, or anywhere else — and you can open notebooks from those tools.
   Plots and tables in notebooks made elsewhere render too: tables as real
   HTML tables (screen readers get row/column navigation), and images with
   a description flow — press `Ctrl+Shift+G` to attach alt text that is
   saved into the file for every future reader.
5. `Ctrl+,` opens settings: per-cell execution time limit, how much output
   is read aloud verbatim, and the autosave interval (unsaved work is
   offered for recovery after a crash).

## The keyboard model

Like Jupyter, a cell is either *selected* (focus on the cell itself) or
*being edited* (focus in its editor):

| Key | Where | Action |
| --- | --- | --- |
| `Up` / `Down` | selected cell | previous / next cell |
| `Enter` | selected cell | edit the cell |
| `Escape` | editor | back to the selected cell |
| `Shift+Enter` | anywhere | run cell and advance |
| `Ctrl+Enter` | anywhere | run cell in place |
| `Ctrl+Shift+B` / `Ctrl+Shift+A` | anywhere | insert code cell below / above |
| `Ctrl+Shift+M` | anywhere | insert markdown cell below |
| `Ctrl+Shift+D` | anywhere | delete cell |
| `Alt+Up` / `Alt+Down` | anywhere | move cell up / down |
| `Ctrl+Shift+I` / `Ctrl+Shift+O` | anywhere | describe cell / read its output |
| `Ctrl+Alt+Z` / `Ctrl+Alt+Y` | anywhere | undo / redo cell operations |
| `Ctrl+F` | anywhere | find and replace across cells |
| `Ctrl+.` / `Ctrl+Shift+.` | anywhere | interrupt / restart kernel |
| `F6` | anywhere | cycle toolbar / cells / status bar |

Screen reader users: see [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) for
notes on NVDA/JAWS focus mode and the design decisions behind the UI.

## Kernels

Kernels are persistent for the whole session — variables defined in one cell
are available in the next, across runs, until you restart the kernel.

- **Python 3** — your system `python3`, stdlib only, structured tracebacks,
  `KeyboardInterrupt` on demand.
- **JavaScript (Node.js)** — a persistent `node:vm` context in a child
  process, with `console` capture, awaited promises, and top-level `await`.

Output **streams into the cell as it is produced**, and a summary is
announced when the cell finishes.

Each kernel is a plain child process speaking a small JSON-lines protocol, so
adding a language means writing one runner script — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Scripting the notebook from a cell

Code running in a kernel can manipulate the notebook itself through the
`notebook` object (cell indices are 0-based):

```python
# Python
created = notebook.insert_cell(source="print('generated')", type="code")
notebook.set_source(created["index"], "print('edited')")
notebook.cell_count()
```

```javascript
// JavaScript (the API is async)
const created = await notebook.insertCell({ source: "1 + 1" });
await notebook.getSource(created.index);
```

> Note: as in Jupyter, notebook code is *your* code and runs with your
> privileges. The child-process design is for robustness and restartability,
> not a security sandbox.

## Development

```bash
npm test     # runs the full suite with Node's built-in test runner
```

The core (notebook store, `.ipynb` serialization, markdown) and the complete
kernel execution path are tested headlessly — no display or Electron needed.

Project documentation:

- [docs/REFACTOR_PLAN.md](docs/REFACTOR_PLAN.md) — assessment of the original
  prototype and the plan this rebuild follows, including future milestones.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit together.
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — accessibility design rules
  and screen-reader testing status.

## License

MIT — see [LICENSE](LICENSE).
