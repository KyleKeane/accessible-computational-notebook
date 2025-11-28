const path = require('path');
const fs = require('fs');

class InterpreterManager {
  constructor() {
    this.interpreters = new Map();
    this.loadInterpreters();
  }

  loadInterpreters() {
    const interpretersDir = __dirname;
    const interpreterFiles = fs.readdirSync(interpretersDir).filter((file) => {
      return (
        file.endsWith('Interpreter.js') &&
        file !== 'BaseInterpreter.js' &&
        file !== 'InterpreterManager.js'
      );
    });

    interpreterFiles.forEach((file) => {
      try {
        const InterpreterClass = require(path.join(interpretersDir, file));
        const interpreter = new InterpreterClass();
        this.interpreters.set(interpreter.name, interpreter);
        console.log(`Loaded interpreter: ${interpreter.name}`);
      } catch (error) {
        console.error(`Failed to load interpreter ${file}:`, error);
      }
    });
  }

  async execute(interpreterName, code, context = {}) {
    const interpreter = this.interpreters.get(interpreterName);

    if (!interpreter) {
      throw new Error(`Interpreter '${interpreterName}' not found`);
    }

    try {
      // Pass context (including notebookManager) to interpreter
      const result = await interpreter.execute(code, context);
      return result;
    } catch (error) {
      throw new Error(`Execution error: ${error.message}`);
    }
  }

  getAvailableInterpreters() {
    const interpreters = [];

    this.interpreters.forEach((interpreter, name) => {
      interpreters.push({
        name: name,
        displayName: interpreter.displayName,
        version: interpreter.version,
        description: interpreter.description,
        supportedFeatures: interpreter.supportedFeatures
      });
    });

    return interpreters;
  }

  getInterpreter(name) {
    return this.interpreters.get(name);
  }

  registerInterpreter(interpreter) {
    if (!interpreter.name) {
      throw new Error('Interpreter must have a name property');
    }

    this.interpreters.set(interpreter.name, interpreter);
    console.log(`Registered interpreter: ${interpreter.name}`);
  }

  unregisterInterpreter(name) {
    const interpreter = this.interpreters.get(name);

    if (interpreter && interpreter.cleanup) {
      interpreter.cleanup();
    }

    this.interpreters.delete(name);
    console.log(`Unregistered interpreter: ${name}`);
  }
}

module.exports = InterpreterManager;
