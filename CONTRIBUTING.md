# Contributing

Thanks for helping build a notebook that blind and keyboard-only users can
rely on. Accessibility is the design constraint here, not a feature — every
change is evaluated against that first.

## Getting started

```bash
npm install     # Electron is the only dependency
npm start       # run the app
npm test        # run the suite (no display needed; requires python3)
```

Read these before writing code:

- `docs/ARCHITECTURE.md` — how the pieces fit; where new code belongs.
- `docs/ACCESSIBILITY.md` — the rules every UI change must keep true.
- `docs/REFACTOR_PLAN.md` — why things are the way they are; the roadmap.

## Ground rules

1. **Zero runtime npm dependencies.** The core must stay testable with plain
   Node, and `npm install` must stay trivial. If a feature seems to need a
   library, raise an issue first.
2. **The core never imports Electron.** Model logic goes in `src/core/`,
   kernel logic in `src/main/kernels/` (Electron-free), and both get tests.
3. **Every feature is a menu item** with an accelerator, an announcement,
   and a line in the Help dialog (`F1`).
4. **Tests accompany code.** `node --test` runs headless — there is no
   excuse for an untested store/kernel/serialization change. The Electron
   shell is the only layer verified manually.
5. **Honest docs.** Don't claim screen-reader compatibility that hasn't been
   tested; update the status table in `docs/ACCESSIBILITY.md` instead.

## The accessibility checklist (apply to every UI PR)

- [ ] Reachable from the menu bar with an accelerator shown.
- [ ] State changes are announced once, politely (assertive only for errors).
- [ ] Focus moves only as the direct result of a user command.
- [ ] No new live regions; no `role="application"`; no screen-reader
      detection; no `Alt+letter`, `Insert`, or `CapsLock` shortcuts.
- [ ] Labels on every control; correct semantics over ARIA repair.
- [ ] Works at 200 % zoom, in dark mode, and in forced-colors mode.

## Adding a kernel

Write one runner script speaking the JSON-lines protocol (persistent state,
streams during execution, structured errors), register it in
`KERNEL_SPECS`, and add integration tests mirroring `test/kernels.test.js`.
See `docs/ARCHITECTURE.md` for the message shapes.

## Screen reader testing

Real-world reports are the most valuable contribution of all. Use the
"Screen reader feedback" issue template — include your screen reader,
version, OS, and what you tried. Partial reports are welcome.
