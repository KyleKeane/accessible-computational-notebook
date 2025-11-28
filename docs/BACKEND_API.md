# Backend Notebook API

## Overview

The Accessible Computational Notebook now features a **unified backend API** that allows code running in interpreters to manipulate the notebook structure, similar to Mathematica's `NotebookWrite`, `NotebookRead`, and other notebook manipulation functions.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Renderer Process (Frontend)                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │ FrontEnd API (UI manipulation)                   │   │
│  │ - FrontEnd.CreateCell()                          │   │
│  │ - FrontEnd.EvaluateCell()                        │   │
│  └─────────────────────────────────────────────────┘   │
│                         ↕ IPC                           │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│  Main Process (Backend)                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │ NotebookManager (State)                          │   │
│  │ - Authoritative notebook state                   │   │
│  │ - Event emitter for changes                      │   │
│  └─────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ NotebookAPI (Interface)                          │   │
│  │ - NotebookWrite(), NotebookRead()                │   │
│  │ - Exposed to interpreter sandboxes               │   │
│  └─────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Interpreters (JavaScript, Python, etc.)          │   │
│  │ - Execute user code with Notebook API access     │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## State Management

### Authoritative State Location

The **NotebookManager** in the main process holds the authoritative notebook state:

```javascript
// Main Process
const notebookManager = require('./src/notebook/NotebookManager');

// State is stored here
const notebook = {
  cells: [
    {
      id: 'cell-1',
      type: 'code',
      content: 'x = 42',
      output: '',
      metadata: { ... }
    }
  ],
  metadata: { ... },
  selection: {
    currentCellIndex: 0
  }
};
```

### State Synchronization

State flows bidirectionally:

1. **Frontend → Backend**: User edits sync to backend
2. **Backend → Frontend**: Backend changes push to frontend via IPC events

```javascript
// Frontend syncs state to backend
window.electronAPI.notebookSync(notebook);

// Backend pushes updates to frontend
mainWindow.webContents.send('notebook-update', {
  type: 'cell-created',
  data: { cell, index }
});
```

## Backend API Functions

### Available in Interpreter Sandboxes

When code executes in an interpreter, these functions are available:

#### Cell Manipulation

```javascript
// Create a new cell (like Mathematica's NotebookWrite)
NotebookWrite("console.log('Hello')", "below", "code");
// Returns: cell index

// Write to next cell
NotebookWriteNext("x = 10");

// Write to current cell
NotebookWriteCurrent("updated content");

// Append to current cell
NotebookAppend("\nconsole.log('appended');");
```

#### Cell Reading

```javascript
// Read cell content
const content = NotebookRead(0);  // Read cell at index 0
const current = NotebookReadCurrent();  // Read current cell
const previous = NotebookReadRelative(-1);  // Read previous cell
```

#### Notebook Queries

```javascript
// Get entire notebook
const notebook = NotebookGet();

// Get all cells
const cells = NotebookGetCells();

// Get cell count
const count = NotebookCellCount();

// Get current cell index
const index = CurrentCellIndex();
```

#### Cell Operations

```javascript
// Delete a cell
NotebookDelete(2);

// Set cell metadata
NotebookSetMetadata(0, { tags: ['important'] });

// Get cell metadata
const meta = NotebookGetMetadata(0);
```

#### Navigation

```javascript
// Move selection
SelectionMove('next');    // Move to next cell
SelectionMove('previous'); // Move to previous cell
SelectionMove('first');    // Move to first cell
SelectionMove('last');     // Move to last cell
```

#### Search

```javascript
// Find cells by content
const results = NotebookFind('console.log');

// Find cells by predicate
const codeCells = NotebookFind((cell) => cell.type === 'code');
```

#### Batch Operations

```javascript
// Create cells from array
NotebookCreateFromArray([
  'const a = 1',
  'const b = 2',
  'const c = a + b'
]);

// Create grid of cells
NotebookCreateGrid(3, 3, 'code');  // 3x3 grid

// Get all outputs
const outputs = NotebookGetOutputs();

// Clear all outputs
NotebookClearOutputs();
```

#### Result Insertion

```javascript
// Replace current cell with result
ReplaceWithResult(42);

// Insert result as new cell
InsertResult(someValue, 'below', 'code');
```

## Usage Examples

### Example 1: Generate Cells from Computation

```javascript
// Cell 1: Generate multiplication table
const size = 5;

for (let i = 1; i <= size; i++) {
  const expr = [];
  for (let j = 1; j <= size; j++) {
    expr.push(`${i} × ${j} = ${i * j}`);
  }
  NotebookWrite(expr.join(', '), 'end', 'markdown');
}

console.log(`Created ${size} cells with multiplication table`);
```

### Example 2: Analyze and Modify Notebook

```javascript
// Cell 1: Find all cells with errors
const allCells = NotebookGetCells();
const errorCells = [];

allCells.forEach((cell, index) => {
  if (cell.output && cell.output.includes('Error')) {
    errorCells.push(index);
  }
});

// Add a summary cell
NotebookWrite(
  `Found ${errorCells.length} cells with errors: ${errorCells.join(', ')}`,
  'end',
  'markdown'
);
```

### Example 3: Mathematica-style Computation

```javascript
// Cell 1: Solve equation and write result to next cell
const solutions = [1, 2, 3];  // Simulated solutions
const result = `Solutions: ${solutions.join(', ')}`;

NotebookWriteNext(result, 'markdown');

console.log('Solutions written to next cell');
```

### Example 4: Interactive Data Pipeline

```javascript
// Cell 1: Load data
const data = [1, 2, 3, 4, 5];
NotebookSetMetadata(CurrentCellIndex(), { stage: 'load' });

// Cell 2: Transform data
const prevCell = NotebookReadRelative(-1);
// Parse data from previous cell
const transformed = data.map(x => x * 2);

NotebookWrite(
  `Transformed: ${JSON.stringify(transformed)}`,
  'below'
);
```

### Example 5: Create Documentation

```javascript
// Auto-generate documentation from code cells
const cells = NotebookGetCells();
const codeCells = cells.filter(c => c.type === 'code');

let docs = '# Code Documentation\n\n';

codeCells.forEach((cell, i) => {
  docs += `## Section ${i + 1}\n\n`;
  docs += '```javascript\n';
  docs += cell.content;
  docs += '\n```\n\n';

  if (cell.output) {
    docs += `**Output:** ${cell.output}\n\n`;
  }
});

NotebookWrite(docs, 'end', 'markdown');
```

### Example 6: Test Runner

```javascript
// Run tests and create result cells
const tests = [
  { name: 'Test 1', fn: () => 2 + 2 === 4 },
  { name: 'Test 2', fn: () => 'hello'.length === 5 },
  { name: 'Test 3', fn: () => [1,2,3].length === 3 }
];

let passed = 0;
let failed = 0;

tests.forEach(test => {
  const result = test.fn();
  const status = result ? '✓ PASS' : '✗ FAIL';

  NotebookWrite(
    `${status}: ${test.name}`,
    'end',
    'markdown'
  );

  result ? passed++ : failed++;
});

NotebookWrite(
  `**Results:** ${passed} passed, ${failed} failed`,
  'end',
  'markdown'
);
```

## Comparison with Mathematica

### Mathematica Example

```mathematica
(* Solve and write result *)
result = Solve[x^2 + 2x + 1 == 0, x];
NotebookWrite[NextCell[], result];

(* Get current cell *)
nb = EvaluationNotebook[];
content = NotebookRead[nb];
```

### Accessible Notebook Equivalent

```javascript
// Solve and write result
const result = solvQuadratic(1, 2, 1);  // Your solver
NotebookWriteNext(JSON.stringify(result));

// Get current cell
const notebook = NotebookGet();
const content = NotebookReadCurrent();
```

## Integration with Python

The Python interpreter can also access the Notebook API (implementation similar to JavaScript):

```python
# Python cell
import json

# Create new cells from Python
for i in range(5):
    NotebookWrite(f"Value: {i}", "end", "markdown")

# Read cells
current = NotebookReadCurrent()
print(f"Current cell content: {current}")

# Get notebook structure
notebook = NotebookGet()
print(f"Total cells: {len(notebook['cells'])}")
```

## Event System

The NotebookManager emits events that can be listened to:

```javascript
// In main process
notebookManager.on('cell-created', (data) => {
  console.log('Cell created:', data.cell.id);
});

notebookManager.on('cell-updated', (data) => {
  console.log('Cell updated:', data.cellIndex);
});

notebookManager.on('cell-output', (data) => {
  console.log('Cell executed:', data.cellIndex);
});
```

## Frontend vs Backend API

### Frontend API (FrontEnd.*)

- Runs in renderer process
- Manipulates UI directly
- Synchronous
- Used for interactive UI scripting

```javascript
// Frontend API (in renderer)
FrontEnd.CreateCell('code', 'x = 1');
FrontEnd.SelectNextCell();
```

### Backend API (Notebook.*)

- Runs in main process (interpreter sandbox)
- Modifies authoritative state
- Can be async
- Used by executing code to modify notebook structure

```javascript
// Backend API (in interpreter)
NotebookWrite('x = 1', 'below');
SelectionMove('next');
```

## Best Practices

### 1. Use Backend API for Code-Generated Content

```javascript
// Good: Use backend API in executing code
const results = computeSomething();
NotebookWrite(results, 'below');
```

### 2. Use Frontend API for User Interactions

```javascript
// Good: Use frontend API for UI automation
FrontEnd.CreateCell('code', userInput);
FrontEnd.EvaluateCell();
```

### 3. Sync State Appropriately

```javascript
// After frontend changes, sync to backend
window.electronAPI.notebookSync(notebook.toJSON());
```

### 4. Handle Async Operations

```javascript
// Backend API calls can be async
const result = await computeAsync();
NotebookWriteNext(result);
```

## Implementation Details

### NotebookManager

Located at `src/notebook/NotebookManager.js`

- Singleton instance
- Manages notebook state
- Event emitter
- Methods for CRUD operations on cells

### NotebookAPI

Located at `src/notebook/NotebookAPI.js`

- Wrapper around NotebookManager
- Provides friendly function names (similar to Mathematica)
- Injected into interpreter sandboxes

### IPC Handlers

In `main.js`:

- `notebook-sync`: Frontend → Backend sync
- `notebook-get`: Get notebook state
- `notebook-create-cell`: Create cell from backend
- `notebook-set-cell-content`: Update cell
- `notebook-delete-cell`: Delete cell
- `execute-code`: Execute with notebook context

## Security Considerations

The Notebook API is sandboxed within VM2 for JavaScript:

```javascript
// Sandboxed execution
const vm = new VM({
  timeout: 5000,
  sandbox: {
    NotebookWrite,
    NotebookRead,
    // ... other safe APIs
  }
});
```

No direct file system or process access is provided to the sandbox.

## Future Enhancements

Planned improvements:

- **Undo/Redo**: Track notebook history
- **Transactions**: Batch multiple operations
- **Cell Dependencies**: Automatically track cell relationships
- **Incremental Sync**: Only sync changed cells
- **Multi-notebook Support**: Manipulate multiple open notebooks
- **Cell Groups**: Hierarchical cell organization

## Troubleshooting

### Functions Not Available

If Notebook API functions are undefined:

1. Check that code is executing in an interpreter
2. Verify NotebookManager is passed in context
3. Check console for errors

### State Not Syncing

If changes don't appear:

1. Ensure frontend calls `notebookSync()`
2. Check IPC event listeners are set up
3. Verify NotebookManager events are firing

### Performance Issues

For large notebooks:

1. Use batch operations (`NotebookCreateFromArray`)
2. Avoid excessive cell creation in loops
3. Consider pagination for large datasets

## Examples Repository

See `examples/notebook-api-demos.json` for complete working examples of all Notebook API features.
