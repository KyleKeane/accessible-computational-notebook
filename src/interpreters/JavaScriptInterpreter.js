const BaseInterpreter = require('./BaseInterpreter');
const NotebookAPI = require('../notebook/NotebookAPI');
const { VM } = require('vm2');

class JavaScriptInterpreter extends BaseInterpreter {
  constructor() {
    super({
      name: 'javascript',
      displayName: 'JavaScript (Node.js)',
      version: process.version,
      description: 'JavaScript interpreter using Node.js VM with Notebook API',
      supportedFeatures: [
        'async/await',
        'ES6+',
        'modules',
        'console output',
        'persistent context',
        'notebook manipulation'
      ]
    });

    this.vm = new VM({
      timeout: 5000,
      sandbox: {
        console: this.createConsole(),
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
        Promise,
        ...this.context
      }
    });

    this.output = [];
    this.currentNotebookAPI = null;
  }

  createConsole() {
    return {
      log: (...args) => {
        const message = args
          .map((arg) => {
            if (typeof arg === 'object') {
              return JSON.stringify(arg, null, 2);
            }
            return String(arg);
          })
          .join(' ');
        this.output.push(message);
      },
      error: (...args) => {
        const message = 'Error: ' + args.join(' ');
        this.output.push(message);
      },
      warn: (...args) => {
        const message = 'Warning: ' + args.join(' ');
        this.output.push(message);
      },
      info: (...args) => {
        const message = 'Info: ' + args.join(' ');
        this.output.push(message);
      }
    };
  }

  async execute(code, context = {}) {
    this.output = [];

    // If notebook manager is provided, add Notebook API to sandbox
    if (context.notebookManager) {
      const notebookAPI = new NotebookAPI(context.notebookManager, {
        cellIndex: context.cellIndex
      });

      // Expose all NotebookAPI methods to the sandbox
      const apiMethods = {};
      Object.getOwnPropertyNames(Object.getPrototypeOf(notebookAPI)).forEach((method) => {
        if (method !== 'constructor') {
          apiMethods[method] = (...args) => notebookAPI[method](...args);
        }
      });

      // Add to VM sandbox
      Object.keys(apiMethods).forEach((key) => {
        this.vm.sandbox[key] = apiMethods[key];
      });

      // Also create a Notebook object for namespaced access
      this.vm.sandbox.Notebook = apiMethods;

      this.currentNotebookAPI = notebookAPI;
    }

    try {
      let result = this.vm.run(code);

      if (result !== undefined) {
        if (typeof result === 'object') {
          this.output.push(JSON.stringify(result, null, 2));
        } else {
          this.output.push(String(result));
        }
      }

      return this.output.join('\n') || '(no output)';
    } catch (error) {
      throw new Error(this.formatError(error));
    }
  }

  async reset() {
    super.reset();
    this.vm = new VM({
      timeout: 5000,
      sandbox: {
        console: this.createConsole(),
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
        Promise,
        ...this.context
      }
    });
  }

  setContext(context) {
    super.setContext(context);

    Object.keys(context).forEach((key) => {
      this.vm.sandbox[key] = context[key];
    });
  }
}

module.exports = JavaScriptInterpreter;
