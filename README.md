# Accessible Computational Notebook

An accessible, keyboard-optimized computational notebook application built with Electron, designed for users who rely on keyboard navigation and screen readers. Similar to Jupyter Notebooks and Wolfram Notebooks, but with a strong focus on accessibility and modular backend interpreters.

## Features

### Accessibility First
- **Full Keyboard Navigation**: Navigate and edit cells without ever touching a mouse
- **Screen Reader Optimized**: ARIA labels, live regions, and semantic HTML
- **High Contrast Mode Support**: Respects system preferences
- **Reduced Motion Support**: Animations adapt to user preferences
- **Focus Management**: Clear visual and auditory focus indicators

### Modular Architecture
- **Pluggable Interpreters**: Easy to add new language backends
- **Persistent Sessions**: Interpreters maintain state between executions
- **Isolated Execution**: Safe sandboxed code execution

### Built-in Interpreters
- **JavaScript/Node.js**: Execute JavaScript code with full ES6+ support
- **Python**: Run Python code with persistent REPL session

### Frontend Scripting API
- **FrontEnd Tokens**: Programmatically control the notebook interface
- **Similar to Wolfram**: Familiar API for Wolfram Notebook users
- **Extensible**: Register custom tokens for automation

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/accessible-computational-notebook.git
cd accessible-computational-notebook

# Install dependencies
npm install

# Start the application
npm start
```

## Requirements

- Node.js 16+
- Python 3.x (for Python interpreter support)

## Quick Start

1. **Launch the application**: Run `npm start`
2. **Create cells**: Press `Alt+C` for code cells, `Alt+M` for markdown cells
3. **Write code**: Type in the cell editor
4. **Execute**: Press `Shift+Enter` to run and move to next cell
5. **Navigate**: Use arrow keys to move between cells

## Keyboard Shortcuts

### Navigation
- `↑` / `↓` - Move between cells (when not editing)
- `Enter` - Enter edit mode
- `Escape` - Exit edit mode
- `Tab` - Move to next focusable element
- `Shift+Tab` - Move to previous focusable element

### Cell Operations
- `Shift+Enter` - Run cell and move to next
- `Ctrl+Enter` - Run cell
- `Alt+Enter` - Run cell and insert below
- `Alt+C` - Add code cell below
- `Alt+M` - Add markdown cell below
- `Alt+Delete` - Delete current cell
- `Alt+Shift+Enter` - Run all cells

### Other
- `Ctrl+S` - Save notebook
- `Ctrl+/` - Show keyboard shortcuts
- `Alt+H` - Describe current cell (for screen readers)

## FrontEnd API

The FrontEnd API provides programmatic control over the notebook, similar to Wolfram's FrontEnd tokens.

### Cell Manipulation

```javascript
// Create a new code cell
FrontEnd.CreateCell('code', 'console.log("Hello World")', 'below');

// Delete a cell
FrontEnd.DeleteCell(0);

// Select a cell
FrontEnd.SelectCell(2);

// Move cells
FrontEnd.MoveCellUp();
FrontEnd.MoveCellDown();
```

### Cell Execution

```javascript
// Evaluate current cell
await FrontEnd.EvaluateCell();

// Evaluate specific cell
await FrontEnd.EvaluateCell(0);

// Evaluate all cells
await FrontEnd.EvaluateAllCells();
```

### Cell Content

```javascript
// Get cell content
const content = FrontEnd.GetCellContent(0);

// Set cell content
FrontEnd.SetCellContent('2 + 2', 0);

// Get cell output
const output = FrontEnd.GetCellOutput(0);

// Clear cell output
FrontEnd.ClearCellOutput(0);
```

### Notebook Operations

```javascript
// Get entire notebook
const notebook = FrontEnd.GetNotebook();

// Load notebook
FrontEnd.SetNotebook(notebookData);

// Get cell count
const count = FrontEnd.GetCellCount();

// Get current cell index
const index = FrontEnd.GetCurrentCellIndex();
```

### Styling

```javascript
// Set cell style
FrontEnd.SetCellStyle({ backgroundColor: '#f0f0f0' }, 0);

// Set theme
FrontEnd.SetTheme('dark');
```

### Utilities

```javascript
// Show message
FrontEnd.ShowMessage('Processing complete', 'success');

// Execute command
FrontEnd.ExecuteCommand('save');

// Batch operations
await FrontEnd.BatchExecute([
  () => FrontEnd.CreateCell('code', 'x = 1'),
  () => FrontEnd.CreateCell('code', 'y = 2'),
  () => FrontEnd.CreateCell('code', 'x + y')
]);
```

### Metadata

```javascript
// Get cell metadata
const metadata = FrontEnd.GetCellMetadata(0);

// Set cell metadata
FrontEnd.SetCellMetadata({ tags: ['important'] }, 0);
```

### Type Conversion

```javascript
// Convert cell type
FrontEnd.ConvertCellType('markdown', 0);
```

## Adding Custom Interpreters

Create a new interpreter by extending `BaseInterpreter`:

```javascript
// src/interpreters/MyInterpreter.js
const BaseInterpreter = require('./BaseInterpreter');

class MyInterpreter extends BaseInterpreter {
  constructor() {
    super({
      name: 'mylang',
      displayName: 'My Language',
      version: '1.0.0',
      description: 'My custom language interpreter',
      supportedFeatures: ['feature1', 'feature2']
    });
  }

  async execute(code) {
    // Implement code execution logic
    const result = this.runMyLanguage(code);
    return result;
  }

  async cleanup() {
    // Clean up resources
  }
}

module.exports = MyInterpreter;
```

The interpreter will be automatically loaded by the `InterpreterManager`.

## Architecture

```
accessible-computational-notebook/
├── main.js                      # Electron main process
├── preload.js                   # Preload script (IPC bridge)
├── index.html                   # Main HTML
├── styles/
│   └── main.css                 # Styles with accessibility features
├── src/
│   ├── interpreters/
│   │   ├── BaseInterpreter.js           # Base class for interpreters
│   │   ├── InterpreterManager.js        # Manages interpreter lifecycle
│   │   ├── JavaScriptInterpreter.js     # JavaScript backend
│   │   └── PythonInterpreter.js         # Python backend
│   └── renderer/
│       ├── notebook.js          # Notebook cell management
│       ├── accessibility.js     # Accessibility features
│       ├── keyboard.js          # Keyboard navigation
│       ├── frontendAPI.js       # FrontEnd scripting API
│       └── app.js               # Application initialization
```

## Accessibility Features

### Screen Reader Support
- ARIA landmarks for navigation
- Live regions for status updates
- Descriptive labels for all interactive elements
- Semantic HTML structure

### Keyboard Navigation
- Complete keyboard control
- No mouse required
- Logical tab order
- Keyboard shortcuts for all operations

### Visual Accessibility
- High contrast mode support
- Focus indicators
- Reduced motion support
- Configurable themes

## Development

```bash
# Run in development mode with DevTools
npm run dev

# Run tests (when available)
npm test
```

## Example Notebooks

### JavaScript Example

```javascript
// Cell 1: Variables and functions
const greet = (name) => `Hello, ${name}!`;
console.log(greet("World"));

// Cell 2: Async operations
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
await delay(1000);
console.log("1 second passed");

// Cell 3: Using previous context
console.log(greet("Accessible Notebook"));
```

### Python Example

```python
# Cell 1: Basic computation
x = 10
y = 20
print(f"Sum: {x + y}")

# Cell 2: Functions
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print(f"Factorial of 5: {factorial(5)}")

# Cell 3: Using previous context
print(f"x = {x}, y = {y}")
```

### Frontend API Automation

```javascript
// Create a series of cells programmatically
const cells = [
  "const a = 1;",
  "const b = 2;",
  "const c = a + b;",
  "console.log(`Result: ${c}`);"
];

cells.forEach(code => {
  FrontEnd.CreateCell('code', code);
});

// Execute all cells
await FrontEnd.EvaluateAllCells();
```

## Contributing

Contributions are welcome! Please ensure:
- Accessibility features are maintained
- Keyboard navigation works for all new features
- Screen readers can access all content
- Code follows existing patterns

## License

ISC License - see LICENSE file for details

## Acknowledgments

Inspired by:
- Jupyter Notebooks
- Wolfram Notebooks
- Observable Notebooks

Built with accessibility in mind for all users.
