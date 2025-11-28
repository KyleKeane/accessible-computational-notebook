const BaseInterpreter = require('./BaseInterpreter');
const { spawn } = require('child_process');
const os = require('os');

class PythonInterpreter extends BaseInterpreter {
  constructor() {
    super({
      name: 'python',
      displayName: 'Python',
      version: '3.x',
      description: 'Python interpreter with persistent session',
      supportedFeatures: [
        'persistent context',
        'standard library',
        'async execution',
        'error handling'
      ]
    });

    this.pythonProcess = null;
    this.initializePython();
  }

  initializePython() {
    const pythonCommand = os.platform() === 'win32' ? 'python' : 'python3';

    this.pythonProcess = spawn(pythonCommand, ['-i', '-u'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.pythonProcess.on('error', (error) => {
      console.error('Python process error:', error);
    });

    this.pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
    });
  }

  async execute(code) {
    return new Promise((resolve, reject) => {
      if (!this.pythonProcess || this.pythonProcess.killed) {
        reject(new Error('Python interpreter is not running'));
        return;
      }

      let output = '';
      let errorOutput = '';

      const stdoutHandler = (data) => {
        output += data.toString();
      };

      const stderrHandler = (data) => {
        errorOutput += data.toString();
      };

      this.pythonProcess.stdout.on('data', stdoutHandler);
      this.pythonProcess.stderr.on('data', stderrHandler);

      const executionMarker = `__EXEC_${Date.now()}__`;
      const wrappedCode = `
try:
${code.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    import traceback
    print(traceback.format_exc(), file=__import__('sys').stderr)
print("${executionMarker}")
`;

      this.pythonProcess.stdin.write(wrappedCode + '\n');

      const timeout = setTimeout(() => {
        this.pythonProcess.stdout.removeListener('data', stdoutHandler);
        this.pythonProcess.stderr.removeListener('data', stderrHandler);

        if (errorOutput) {
          reject(new Error(this.cleanPythonOutput(errorOutput)));
        } else {
          resolve(this.cleanPythonOutput(output));
        }
      }, 5000);

      const checkOutput = () => {
        if (output.includes(executionMarker)) {
          clearTimeout(timeout);
          this.pythonProcess.stdout.removeListener('data', stdoutHandler);
          this.pythonProcess.stderr.removeListener('data', stderrHandler);

          output = output.replace(executionMarker, '').trim();

          if (errorOutput) {
            reject(new Error(this.cleanPythonOutput(errorOutput)));
          } else {
            resolve(this.cleanPythonOutput(output) || '(no output)');
          }
        }
      };

      this.pythonProcess.stdout.on('data', checkOutput);
    });
  }

  cleanPythonOutput(output) {
    return output
      .replace(/>>> /g, '')
      .replace(/\.\.\. /g, '')
      .trim();
  }

  async cleanup() {
    if (this.pythonProcess && !this.pythonProcess.killed) {
      this.pythonProcess.kill();
    }
  }

  async reset() {
    await this.cleanup();
    this.initializePython();
    super.reset();
  }

  async interrupt() {
    if (this.pythonProcess && !this.pythonProcess.killed) {
      this.pythonProcess.kill('SIGINT');
      this.initializePython();
    }
  }
}

module.exports = PythonInterpreter;
