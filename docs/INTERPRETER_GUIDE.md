# Interpreter Development Guide

This guide explains how to create custom interpreter backends for the Accessible Computational Notebook.

## Overview

Interpreters are modular backends that execute code in different languages. The system is designed to make adding new interpreters straightforward.

## Architecture

```
InterpreterManager
├── Loads all interpreters from src/interpreters/
├── Routes execution requests to appropriate interpreter
└── Manages interpreter lifecycle

BaseInterpreter (abstract class)
├── Provides common functionality
├── Defines interface that all interpreters must implement
└── Handles error formatting and context management

YourInterpreter extends BaseInterpreter
└── Implements execute() method for your language
```

## Creating a New Interpreter

### Step 1: Create Interpreter File

Create a new file in `src/interpreters/` named `YourLanguageInterpreter.js`:

```javascript
const BaseInterpreter = require('./BaseInterpreter');

class YourLanguageInterpreter extends BaseInterpreter {
  constructor() {
    super({
      name: 'yourlang',              // Internal identifier
      displayName: 'Your Language',  // UI display name
      version: '1.0.0',              // Version
      description: 'Your language interpreter',
      supportedFeatures: [           // List of features
        'feature1',
        'feature2'
      ]
    });

    // Initialize your interpreter here
    this.initializeInterpreter();
  }

  initializeInterpreter() {
    // Set up your language runtime
  }

  async execute(code) {
    // Execute the code and return output as a string
    // This is the only required method

    try {
      const result = await this.runCode(code);
      return this.formatOutput(result);
    } catch (error) {
      throw new Error(this.formatError(error));
    }
  }

  async cleanup() {
    // Clean up resources when interpreter is destroyed
    // Optional but recommended
  }
}

module.exports = YourLanguageInterpreter;
```

### Step 2: Implement Required Methods

#### execute(code)

The core method that executes code and returns output:

```javascript
async execute(code) {
  // Your execution logic here
  const result = await this.yourLanguageExecutor(code);

  // Return string output
  return String(result);
}
```

**Requirements:**
- Must be async (return a Promise)
- Input: `code` (string)
- Output: string representation of result
- Throw Error on execution failure

### Step 3: Handle Output

The interpreter should capture and return all output:

```javascript
async execute(code) {
  let output = [];

  // Capture console output
  this.onOutput = (text) => output.push(text);

  // Execute code
  const result = await this.run(code);

  // Combine output
  if (result !== undefined) {
    output.push(String(result));
  }

  return output.join('\n');
}
```

### Step 4: Maintain Context

For persistent REPL-like behavior:

```javascript
class YourLanguageInterpreter extends BaseInterpreter {
  constructor() {
    super(config);
    this.context = {};  // Shared context between executions
  }

  async execute(code) {
    // Execute code in persistent context
    const result = await this.runInContext(code, this.context);
    return String(result);
  }

  async reset() {
    // Clear context when requested
    this.context = {};
    await super.reset();
  }
}
```

## Examples

### Example 1: Simple Expression Evaluator

```javascript
const BaseInterpreter = require('./BaseInterpreter');

class MathInterpreter extends BaseInterpreter {
  constructor() {
    super({
      name: 'math',
      displayName: 'Math Expression',
      version: '1.0.0',
      description: 'Simple mathematical expression evaluator',
      supportedFeatures: ['arithmetic', 'functions']
    });
  }

  async execute(code) {
    try {
      // Use Function constructor for safe math evaluation
      const fn = new Function('Math', `return ${code}`);
      const result = fn(Math);
      return String(result);
    } catch (error) {
      throw new Error(`Math error: ${error.message}`);
    }
  }
}

module.exports = MathInterpreter;
```

### Example 2: WebAssembly Interpreter

```javascript
const BaseInterpreter = require('./BaseInterpreter');
const fs = require('fs');

class WasmInterpreter extends BaseInterpreter {
  constructor() {
    super({
      name: 'wasm',
      displayName: 'WebAssembly',
      version: '1.0.0',
      description: 'WebAssembly module executor',
      supportedFeatures: ['wasm', 'binary']
    });
  }

  async execute(code) {
    // Assuming code is a path to .wasm file
    const wasmBuffer = fs.readFileSync(code);
    const wasmModule = await WebAssembly.instantiate(wasmBuffer);

    // Call exported function
    const result = wasmModule.instance.exports.main();
    return String(result);
  }
}

module.exports = WasmInterpreter;
```

### Example 3: Remote Interpreter

```javascript
const BaseInterpreter = require('./BaseInterpreter');
const axios = require('axios');

class RemoteInterpreter extends BaseInterpreter {
  constructor() {
    super({
      name: 'remote',
      displayName: 'Remote Code Executor',
      version: '1.0.0',
      description: 'Executes code on remote server',
      supportedFeatures: ['remote', 'cloud']
    });

    this.apiUrl = 'https://api.example.com/execute';
    this.sessionId = null;
  }

  async initialize() {
    // Create remote session
    const response = await axios.post(`${this.apiUrl}/session`);
    this.sessionId = response.data.sessionId;
  }

  async execute(code) {
    const response = await axios.post(`${this.apiUrl}/execute`, {
      sessionId: this.sessionId,
      code: code
    });

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    return response.data.output;
  }

  async cleanup() {
    // Clean up remote session
    if (this.sessionId) {
      await axios.delete(`${this.apiUrl}/session/${this.sessionId}`);
    }
  }
}

module.exports = RemoteInterpreter;
```

## BaseInterpreter Methods

You can override these methods from BaseInterpreter:

### initialize()
Called once when interpreter is first loaded:
```javascript
async initialize() {
  this.runtime = await setupRuntime();
}
```

### cleanup()
Called when interpreter is destroyed:
```javascript
async cleanup() {
  await this.runtime.shutdown();
}
```

### reset()
Called to reset interpreter state:
```javascript
async reset() {
  this.context = {};
  await super.reset();
}
```

### interrupt()
Called to stop running code:
```javascript
async interrupt() {
  this.runtime.stop();
}
```

### complete(code, cursorPosition)
Provide code completion suggestions:
```javascript
async complete(code, cursorPosition) {
  return ['suggestion1', 'suggestion2'];
}
```

### inspect(code)
Provide information about code:
```javascript
async inspect(code) {
  return {
    type: 'function',
    signature: 'foo(x, y)',
    documentation: 'Does something'
  };
}
```

## Testing Your Interpreter

### Manual Testing

1. Create your interpreter file
2. Restart the application
3. Your interpreter should appear in the dropdown
4. Create a cell and select your interpreter
5. Test execution

### Debugging

Add logging to your interpreter:

```javascript
async execute(code) {
  console.log('[YourInterpreter] Executing:', code);

  try {
    const result = await this.run(code);
    console.log('[YourInterpreter] Result:', result);
    return String(result);
  } catch (error) {
    console.error('[YourInterpreter] Error:', error);
    throw error;
  }
}
```

### Error Handling

Always provide clear error messages:

```javascript
async execute(code) {
  try {
    return await this.run(code);
  } catch (error) {
    // Enhance error with context
    const enhanced = new Error(
      `Execution failed at line ${error.line}: ${error.message}`
    );
    throw enhanced;
  }
}
```

## Best Practices

### 1. Resource Management

Always clean up resources:
```javascript
async cleanup() {
  if (this.process) {
    this.process.kill();
  }
  if (this.tempFiles) {
    this.tempFiles.forEach(f => fs.unlinkSync(f));
  }
}
```

### 2. Timeout Handling

Prevent infinite loops:
```javascript
async execute(code) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 5000)
  );

  const execution = this.run(code);

  return await Promise.race([execution, timeout]);
}
```

### 3. Output Formatting

Format output consistently:
```javascript
formatOutput(result) {
  if (typeof result === 'object') {
    return JSON.stringify(result, null, 2);
  }
  if (typeof result === 'undefined') {
    return '(no output)';
  }
  return String(result);
}
```

### 4. Context Isolation

Keep contexts separate:
```javascript
class MyInterpreter extends BaseInterpreter {
  constructor() {
    super(config);
    this.contexts = new Map();
  }

  getContext(cellId) {
    if (!this.contexts.has(cellId)) {
      this.contexts.set(cellId, {});
    }
    return this.contexts.get(cellId);
  }
}
```

## Security Considerations

### Sandboxing

Always sandbox code execution:
```javascript
const { VM } = require('vm2');

async execute(code) {
  const vm = new VM({
    timeout: 5000,
    sandbox: {
      // Provide only safe APIs
      console: this.safeConsole(),
      Math: Math
    }
  });

  return vm.run(code);
}
```

### Input Validation

Validate code before execution:
```javascript
async execute(code) {
  // Check for dangerous patterns
  const dangerous = [
    /require\s*\(\s*['"]child_process['"]/,
    /require\s*\(\s*['"]fs['"]/,
    /eval\s*\(/
  ];

  for (const pattern of dangerous) {
    if (pattern.test(code)) {
      throw new Error('Potentially unsafe code detected');
    }
  }

  return await this.safeExecute(code);
}
```

## Advanced Features

### Streaming Output

For long-running processes:
```javascript
async execute(code) {
  return new Promise((resolve, reject) => {
    let output = '';

    const process = spawn('python', ['-c', code]);

    process.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      // Could emit events here for real-time updates
    });

    process.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve(output);
      } else {
        reject(new Error(`Process exited with code ${exitCode}`));
      }
    });
  });
}
```

### Multi-file Support

Handle projects with multiple files:
```javascript
async execute(code) {
  // Parse code for file definitions
  const files = this.parseFiles(code);

  // Write to temp directory
  const tempDir = this.createTempDir();
  files.forEach(f => {
    fs.writeFileSync(path.join(tempDir, f.name), f.content);
  });

  // Execute main file
  const result = await this.runProject(tempDir);

  // Clean up
  this.cleanupTempDir(tempDir);

  return result;
}
```

## Registration and Discovery

Interpreters are automatically discovered if they:
1. Are in `src/interpreters/` directory
2. End with `Interpreter.js` filename
3. Export a class extending BaseInterpreter

Manual registration:
```javascript
const InterpreterManager = require('./InterpreterManager');
const MyInterpreter = require('./MyInterpreter');

const manager = new InterpreterManager();
manager.registerInterpreter(new MyInterpreter());
```

## Troubleshooting

### Interpreter Not Appearing

Check:
1. File is named correctly (`*Interpreter.js`)
2. File is in `src/interpreters/` directory
3. Class is exported: `module.exports = YourInterpreter;`
4. Constructor calls `super()` with config
5. No syntax errors in your code

### Execution Errors

Check:
1. `execute()` method returns a string
2. `execute()` is async (returns Promise)
3. Errors are properly thrown/caught
4. Output is properly formatted

### Context Not Persisting

Check:
1. You're storing context in instance variable
2. You're not recreating context on each execution
3. `reset()` properly clears context

## Example: Complete Interpreter

Here's a complete, production-ready interpreter:

```javascript
const BaseInterpreter = require('./BaseInterpreter');
const { VM } = require('vm2');

class LuaInterpreter extends BaseInterpreter {
  constructor() {
    super({
      name: 'lua',
      displayName: 'Lua',
      version: '5.4',
      description: 'Lua scripting language interpreter',
      supportedFeatures: [
        'persistent context',
        'error handling',
        'timeout support'
      ]
    });

    this.fengari = null;
    this.initialize();
  }

  async initialize() {
    // Load Lua runtime (fengari)
    this.fengari = require('fengari');
    this.L = this.fengari.lauxlib.luaL_newstate();
    this.fengari.lualib.luaL_openlibs(this.L);
  }

  async execute(code) {
    if (!this.L) {
      throw new Error('Lua interpreter not initialized');
    }

    const output = [];

    // Capture print output
    this.fengari.lua.lua_pushglobaltable(this.L);
    this.fengari.lua.lua_pushstring(this.L, "print");
    this.fengari.lua.lua_pushcfunction(this.L, (L) => {
      const str = this.fengari.lua.lua_tostring(L, -1);
      output.push(str);
      return 0;
    });
    this.fengari.lua.lua_settable(this.L, -3);

    try {
      // Execute code
      const status = this.fengari.lauxlib.luaL_dostring(this.L, code);

      if (status !== this.fengari.lua.LUA_OK) {
        const error = this.fengari.lua.lua_tostring(this.L, -1);
        this.fengari.lua.lua_pop(this.L, 1);
        throw new Error(error);
      }

      // Get return value if any
      if (this.fengari.lua.lua_gettop(this.L) > 0) {
        const result = this.fengari.lua.lua_tostring(this.L, -1);
        if (result) output.push(result);
        this.fengari.lua.lua_pop(this.L, 1);
      }

      return output.join('\n') || '(no output)';
    } catch (error) {
      throw new Error(this.formatError(error));
    }
  }

  async cleanup() {
    if (this.L) {
      this.fengari.lua.lua_close(this.L);
      this.L = null;
    }
  }

  async reset() {
    await this.cleanup();
    await this.initialize();
    await super.reset();
  }
}

module.exports = LuaInterpreter;
```

## Resources

- [Node.js VM2 Documentation](https://github.com/patriksimek/vm2)
- [Child Process Documentation](https://nodejs.org/api/child_process.html)
- [WebAssembly JavaScript API](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface)
