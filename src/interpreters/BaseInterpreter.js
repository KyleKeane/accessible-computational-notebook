class BaseInterpreter {
  constructor(config = {}) {
    this.name = config.name || 'base';
    this.displayName = config.displayName || 'Base Interpreter';
    this.version = config.version || '1.0.0';
    this.description = config.description || 'Base interpreter class';
    this.supportedFeatures = config.supportedFeatures || [];
    this.context = {};
  }

  async execute(code) {
    throw new Error('execute() must be implemented by subclass');
  }

  async initialize() {
    // Override in subclass if initialization is needed
  }

  async cleanup() {
    // Override in subclass if cleanup is needed
  }

  async reset() {
    this.context = {};
  }

  async interrupt() {
    // Override in subclass to support interruption
    throw new Error('Interrupt not supported by this interpreter');
  }

  async complete(code, cursorPosition) {
    // Override in subclass to support code completion
    return [];
  }

  async inspect(code) {
    // Override in subclass to support code inspection
    return null;
  }

  getContext() {
    return this.context;
  }

  setContext(context) {
    this.context = { ...this.context, ...context };
  }

  formatError(error) {
    if (error.stack) {
      return error.stack;
    }
    return error.toString();
  }

  captureOutput(fn) {
    const output = [];
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => {
      output.push(args.join(' '));
    };

    console.error = (...args) => {
      output.push('Error: ' + args.join(' '));
    };

    try {
      const result = fn();
      return { output: output.join('\n'), result };
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  }
}

module.exports = BaseInterpreter;
