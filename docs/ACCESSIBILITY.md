# Accessibility Guide

This document provides detailed information about the accessibility features of the Accessible Computational Notebook.

## Overview

The Accessible Computational Notebook is designed from the ground up with accessibility in mind. Every feature can be accessed and controlled via keyboard, and the interface is optimized for screen readers.

## Keyboard Navigation

### Focus Management

The application uses a clear focus management system:

1. **Visual Focus Indicators**: All focusable elements have a visible focus ring
2. **Skip Links**: Jump directly to main content areas
3. **Logical Tab Order**: Tab through elements in a meaningful sequence
4. **Focus Trapping**: Modal dialogs trap focus until closed

### Navigation Modes

The notebook has two navigation modes:

#### Navigation Mode (Default)
When not editing a cell, you can:
- Use arrow keys to move between cells
- Press Enter to enter edit mode
- Press Tab to move to toolbar buttons
- Use keyboard shortcuts for cell operations

#### Edit Mode
When editing a cell:
- Arrow keys move the cursor within the text
- Tab inserts two spaces (code indentation)
- Escape exits edit mode
- Shift+Enter runs the cell

## Screen Reader Support

### ARIA Labels

All interactive elements have descriptive ARIA labels:
- Buttons describe their action and keyboard shortcut
- Cells announce their type, position, and content status
- Status updates are announced in real-time

### Live Regions

The application uses ARIA live regions for dynamic updates:

```html
<!-- Status announcements -->
<div role="status" aria-live="polite">
  Cell 1 executed successfully
</div>

<!-- Cell output -->
<div role="log" aria-live="polite" aria-label="Cell output">
  42
</div>
```

### Landmarks

The interface uses semantic landmarks:
- `<nav>` for the toolbar
- `<main>` for the notebook cells
- `<footer>` for the status bar

### Cell Descriptions

Press `Alt+H` to hear a detailed description of the current cell:
- Cell type (code or markdown)
- Position (e.g., "Cell 3 of 10")
- Content summary (line count, character count)
- Execution status
- Whether output is present

## Keyboard Shortcuts Reference

### Essential Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Alt+C` | Create code cell | Any |
| `Alt+M` | Create markdown cell | Any |
| `Shift+Enter` | Run cell and move next | Any |
| `Ctrl+Enter` | Run current cell | Any |
| `Ctrl+S` | Save notebook | Any |
| `Ctrl+/` | Show shortcuts help | Any |
| `Alt+H` | Describe current cell | Any |

### Navigation Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `↑` | Previous cell | Navigation mode |
| `↓` | Next cell | Navigation mode |
| `Enter` | Enter edit mode | Navigation mode |
| `Escape` | Exit edit mode | Edit mode |
| `Tab` | Next element | Any |
| `Shift+Tab` | Previous element | Any |

### Cell Operations

| Shortcut | Action |
|----------|--------|
| `Alt+Enter` | Run cell and insert below |
| `Alt+Delete` | Delete current cell |
| `Alt+Shift+Enter` | Run all cells |
| `Ctrl+Z` | Undo (in edit mode) |
| `Ctrl+Y` | Redo (in edit mode) |

## System Preferences

The application respects system accessibility preferences:

### High Contrast Mode

When your system is in high contrast mode:
- Border widths increase
- Color contrasts are enhanced
- Focus indicators are more prominent

The app detects this via:
```css
@media (prefers-contrast: high) {
  /* Enhanced contrast styles */
}
```

### Reduced Motion

When reduced motion is preferred:
- Animations are disabled or minimized
- Smooth scrolling is turned off
- Transitions are instant

Detected via:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Dark Mode

The application adapts to system dark mode preferences and maintains WCAG AAA contrast ratios.

## Screen Reader Testing

The application has been tested with:
- NVDA (Windows)
- JAWS (Windows)
- VoiceOver (macOS)
- Orca (Linux)

### Recommended Settings

For the best experience with screen readers:

1. **NVDA**: Enable "Report dynamic content changes"
2. **JAWS**: Set verbosity to "Intermediate" or higher
3. **VoiceOver**: Enable "Speak hints"

## Accessibility Features by Component

### Toolbar
- Clear labels for all buttons
- Keyboard shortcuts shown in tooltips
- Logical grouping of related actions
- Accessible select dropdown for interpreters

### Cells
- Each cell is an ARIA article
- Cell type and position announced
- Edit state clearly indicated
- Output changes announced

### Status Bar
- ARIA live region for status updates
- Cell position indicator
- Current operation feedback

### Dialogs
- Modal focus trap
- Escape key to close
- Clear heading structure
- Close button always reachable

## Common Workflows

### Creating and Running Code

1. **Create a cell**: `Alt+C`
   - Screen reader announces: "Code cell created at position N"

2. **Enter edit mode**: `Enter`
   - Screen reader announces: "Edit mode"

3. **Type your code**: Regular typing
   - Code is entered in the editor

4. **Run the cell**: `Shift+Enter`
   - Screen reader announces: "Running code cell N"
   - Then announces: "Cell N executed successfully" or error message

5. **Review output**: `Tab` to output area or automatic announcement

### Navigating Between Cells

1. **Exit edit mode**: `Escape` (if editing)
2. **Move to next cell**: `↓`
3. **Move to previous cell**: `↑`
4. **Describe current cell**: `Alt+H`

### Batch Operations

1. **Create multiple cells**: Multiple `Alt+C` presses
2. **Run all cells**: `Alt+Shift+Enter`
3. **Monitor progress**: Status updates announced automatically

## Tips for Screen Reader Users

### Understanding Cell State

Listen for these indicators:
- "Empty" - cell has no content
- "Contains N lines" - cell has code
- "Has output" - cell has been executed
- "Executed M times" - execution history

### Efficient Navigation

- Use `Alt+H` frequently to understand context
- Let announcements finish before moving
- Use the shortcuts dialog (`Ctrl+/`) as reference
- Focus toolbar with `Tab` from navigation mode

### Cell Output

- Output is announced automatically when execution completes
- Use `Tab` to navigate to output area for re-reading
- Output area is an ARIA log region for easy access

## Customization

### Custom Keyboard Shortcuts

You can add custom shortcuts by editing `src/renderer/keyboard.js`:

```javascript
shortcuts: {
  'Ctrl+Alt+n': {
    action: () => this.customAction(),
    description: 'My custom action'
  }
}
```

### Custom Announcements

Use the accessibility API to create custom announcements:

```javascript
window.accessibility.announce('My custom message', 'polite');
// or for urgent messages:
window.accessibility.announce('Urgent message', 'assertive');
```

## Reporting Accessibility Issues

If you encounter accessibility barriers:

1. Note your configuration:
   - Operating system
   - Screen reader (name and version)
   - Browser/Electron version
   - Keyboard layout

2. Describe the issue:
   - What you were trying to do
   - What happened
   - What you expected to happen

3. Report at: [GitHub Issues](https://github.com/yourusername/accessible-computational-notebook/issues)

## WCAG Compliance

The application aims for WCAG 2.1 Level AAA compliance:

- ✅ **Perceivable**: All content has text alternatives
- ✅ **Operable**: All functionality available via keyboard
- ✅ **Understandable**: Clear, consistent interface
- ✅ **Robust**: Works with assistive technologies

## Future Enhancements

Planned accessibility improvements:
- Voice input support
- Customizable keyboard shortcuts via UI
- Braille display support
- Enhanced sound feedback option
- Accessible graphical output descriptions

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)
