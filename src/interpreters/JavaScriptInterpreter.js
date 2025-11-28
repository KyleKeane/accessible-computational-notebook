const BaseInterpreter = require('./BaseInterpreter');
const { VM } = require('vm2');

class JavaScriptInterpreter extends BaseInterpreter {
  constructor() {
    super({
      name: 'javascript',
      displayName: 'JavaScript (Node.js)',
      version: process.version,
      description: 'JavaScript interpreter using Node.js VM',
      supportedFeatures: [
        'async/await',
        'ES6+',
        'modules',
        'console output',
        'persistent context'
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

  async execute(code) {
    this.output = [];

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
