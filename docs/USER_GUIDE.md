# User guide: building computational narratives by ear

This guide is written for screen reader users working entirely by
keyboard and audio. Everything here is also discoverable in the app:
press `Alt` (or `F10`) for the menus — every command lives there with its
shortcut — and `F1` for the shortcut list.

## Your first session

1. Start the app (`npm start`). One empty Python code cell has focus.
2. Type `2 + 2` and press `Shift+Enter`. You hear: "Cell 1 done. output: 4."
   Focus is now in a fresh cell at the end.
3. Press `Escape` to step out of the editor onto the cell itself (your
   screen reader reads its label: "Code cell 2 of 2"). Arrow keys move
   between cells; `Enter` re-enters the editor.
4. Press `Ctrl+S` and save. The file is a standard Jupyter notebook.

Three keys to remember before anything else: `Ctrl+Shift+N` tells you
where you are (notebook name, saved state, cells, sections, kernel);
`Ctrl+Shift+L` replays anything you missed (the announcement history);
`F1` lists every shortcut.

## The iteration loop

The fastest way to work out an idea:

- **Quick Evaluate (`Ctrl+E`)**: type an expression, press Enter, hear the
  result. Try again, hear again — the dialog logs your session. When the
  expression is right, press "Insert last as cell" and it joins the
  notebook. Notebook variables are available, because it runs in the same
  kernel session.
- **Run Selection (`F9`)**: select part of a cell, hear what just that
  piece evaluates to. Nothing is stored.
- **`_` and `Out[n]`**: in code, `_` is the last result and `Out[3]` is
  the result of execution 3 — chain results without retyping them.
- **`?name`**: run a cell containing just `?len` (or any symbol) to hear
  its signature and documentation. Mid-edit, `Ctrl+Shift+U` describes the
  symbol at the cursor and `Ctrl+Space` completes the name.
- **What do I have so far?** `Ctrl+Shift+W` lists every variable with its
  type and value in a table.

## Building the narrative

A notebook is a story: prose explains, code computes, results answer.

- Add markdown cells (`Ctrl+Shift+M`) with headings (`# Title`,
  `## Section`) — these become the story's structure. `Ctrl+Shift+J`
  jumps between sections; `Ctrl+Shift+T` collapses a finished section out
  of the way (arrow navigation skips it until you expand it again).
- **Read the story (`Ctrl+Shift+E`)**: narrative mode presents the whole
  notebook as one linear document — prose, code steps, results — that you
  read top to bottom with your screen reader's browse mode, navigating by
  headings. This is the notebook as it will be understood, not as it is
  edited.
- **Keep the record**: File > Export Narrative as Text writes that same
  story to a plain file; Export as HTML produces a standalone document
  (your image descriptions and table semantics travel with it); Export as
  Script produces a runnable `.py`/`.js`/`.sh`.
- Mark setup cells as **initialization cells** (`Ctrl+Alt+I`); after
  reopening a notebook, Cell > Run Initialization Cells re-establishes
  your session in one command.

## Editing structure

Cells move like text: `Ctrl+Shift+X/C/V` cut/copy/paste, `Alt+Up/Down`
move, `Ctrl+Shift+Minus` splits at the cursor, Cell > Merge joins.
`Ctrl+Alt+Z` undoes structural operations (text editing has its own
normal undo). Find and replace across all cells is `Ctrl+F`; `F3`
repeats the search.

## When things run long or wrong

- Output streams into the cell as it is produced; a summary is spoken at
  the end ("3 lines of output. First line: …"); `Ctrl+Shift+O` reads the
  full output whenever you want it.
- Long runs announce "still running" every 30 seconds and report their
  duration when done. `Ctrl+.` interrupts; `Ctrl+Shift+.` restarts the
  kernel (state is lost, and that is announced).
- Set a per-cell time limit in Settings (`Ctrl+,`) and runaway cells stop
  themselves.
- Errors are announced assertively with the exception name and message;
  the session survives, so fix the cell and run again.
- The app autosaves while you have unsaved changes; after a crash, the
  next launch offers to restore your work.

## Images and tables from other tools

Opening a notebook made in Jupyter: tables read as real tables (your
screen reader's table navigation works), and images speak their
description. If an image has none, it says so — press `Ctrl+Shift+G`,
write the description, and it is saved into the file for every future
reader.

## All the shortcuts

Press `F1` in the app — the list there is always current. The README
carries the same table.
