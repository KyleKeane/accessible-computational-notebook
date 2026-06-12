# Accessibility design

This app is built for keyboard-only and screen-reader use first; visual
design is layered on top. This document records the rules the implementation
follows, the rationale, and what has and has not been tested.

## Rules the implementation follows

1. **The native menu bar is the command surface.** Every feature is a menu
   item with its accelerator shown. Native menus are the most reliable UI
   element across NVDA, JAWS, VoiceOver, and Orca, and they make the whole
   command set discoverable without documentation. Custom shortcuts that
   aren't in a menu don't exist.

2. **No `role="application"`, anywhere.** The notebook is an ordinary
   document: a `main` landmark containing one labelled `section` per cell
   ("Code cell 2 of 5, ran 3"). Browse/virtual mode works everywhere.

3. **No screen-reader detection.** There is no reliable way to detect a
   screen reader, and adapting behavior to one creates two diverging apps.
   Everyone gets the same UI.

4. **Exactly two live regions.** One polite (`role="status"`) for results
   and state changes, one assertive (`role="alert"`) for errors. Cell
   outputs are *not* live regions: when a cell finishes, one polite
   announcement summarizes the result ("Cell 2 done. Output: 42"), and the
   output text itself sits in the document where it can be read at leisure.
   Long output is summarized ("14 lines of output. First line: …") instead
   of read in full; `Ctrl+Shift+O` reads the full output on demand.

5. **Focus is never moved or cleared behind the user's back.** Focus moves
   only as the direct result of a user command (insert cell → its editor;
   delete cell → the neighbour; run-and-advance → the next editor).

   **No double speech.** When a command moves focus, the screen reader
   already reads the focused element's label (type, position) — so the
   announcement carries only the event ("Inserted", "Deleted", "Pasted").
   Position is spoken only when focus does not move (e.g. "Moved up to 2
   of 9"). Fast cells skip the "Running" announcement entirely: if a cell
   finishes within 400 ms, only the completion line is spoken.

6. **Shortcut hygiene.** No bare `Alt+letter` (collides with menu
   mnemonics), nothing on `Insert` or `CapsLock` (screen-reader modifiers),
   no overrides of standard editing keys. Jupyter's `Shift+Enter` /
   `Ctrl+Enter` / `Alt+Enter` are preserved for familiarity.

7. **State you can query.** `Ctrl+Shift+I` describes the current cell
   (type, position, size, run count, output presence); `Ctrl+Shift+O` reads
   its output; `Ctrl+Shift+K` announces kernel status. The window title
   carries the filename and modified state, so a title read (e.g. NVDA+T)
   answers "where am I and is it saved".

8. **Images are never silent.** Image outputs (e.g. plots in notebooks made
   with Jupyter) render with their description from the output metadata; if
   there is none, the alt text says so and how to fix it. `Ctrl+Shift+G`
   opens a description editor, and the description is **saved into the
   `.ipynb` file**, so one person describing a plot helps every future
   reader. HTML outputs are sanitized to a whitelist that keeps real
   `<table>` semantics, giving screen readers row/column navigation of
   data frames.

9. **Visuals follow system preferences.** `prefers-color-scheme`,
   `prefers-reduced-motion`, and `forced-colors` are respected in CSS; the
   focus indicator is 3 px and never suppressed; text contrast meets WCAG AA.

## The interaction model

A cell is either **selected** (the `section` itself has focus; arrow keys
move between cells, `Enter` edits) or **being edited** (focus in the
`textarea`; `Escape` goes back to selected). This mirrors Jupyter's
command/edit modes but uses real focus instead of a mode flag, so what a
screen reader announces always matches what keys will do.

Notes for screen reader users:

- In the editor your screen reader will switch to focus/forms mode. Press
  `Escape` once to leave forms mode (NVDA/JAWS) and again to return to the
  selected cell — or use any global shortcut directly; they work from
  anywhere.
- `Tab` indents inside the editor (it's a code editor); leave the editor
  with `Escape` first if you want to move focus, or use `F6` to jump
  between toolbar, cells, and status bar.
- Markdown cells show their rendered form (real headings, lists, and links
  you can navigate) after you run them; press `Enter` on the rendered view
  to edit the source again.

## Testing status (honest)

Automated tests cover the model, file format, markdown rendering, and
kernels — not assistive-technology behavior. Manual screen-reader testing
is tracked here:

| Screen reader | Platform | Status |
| --- | --- | --- |
| NVDA | Windows | not yet tested — top priority |
| JAWS | Windows | not yet tested |
| VoiceOver | macOS | not yet tested |
| Orca | Linux | not yet tested |

If you use this app with any of the above, please open an issue with what
worked and what didn't — that feedback drives the roadmap (see
`docs/REFACTOR_PLAN.md`, Milestone 4).

## Checklist for contributors

Every PR that touches the UI must keep these true:

- [ ] The feature is reachable from the menu bar with an accelerator.
- [ ] Any state change the user triggers is announced once, politely
      (assertively only for errors).
- [ ] Focus only moves as the direct result of a user command.
- [ ] No new live regions; no `role="application"`; no screen-reader
      detection.
- [ ] Works at 200 % zoom and in forced-colors mode.
