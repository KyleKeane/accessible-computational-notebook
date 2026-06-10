/**
 * ProcessKernel — generic client for a child-process kernel runner speaking
 * the JSON lines protocol. No Electron dependency; integration-tested under
 * plain Node against both runners.
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';

export class ProcessKernel extends EventEmitter {
  /**
   * @param {object} spec
   * @param {string} spec.command   executable, e.g. 'python3' or process.execPath
   * @param {string[]} spec.args    arguments, e.g. [runnerPath]
   * @param {string} spec.displayName
   */
  constructor(spec) {
    super();
    this.spec = spec;
    this.process = null;
    this.pending = new Map(); // id -> { resolve }
    this.nextId = 1;
    this.status = 'stopped'; // stopped | starting | idle | busy | dead
  }

  start() {
    if (this.process) return;
    this.status = 'starting';
    const child = spawn(this.spec.command, this.spec.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(this.spec.env ?? {}) }
    });
    this.process = child;

    const rl = readline.createInterface({ input: child.stdout, terminal: false });
    rl.on('line', (line) => this.#handleLine(line));

    child.stderr.on('data', (chunk) => {
      this.emit('kernel-stderr', chunk.toString());
    });

    child.on('error', (error) => {
      if (this.process !== child) return;
      this.status = 'dead';
      this.#failAll(`Could not start ${this.spec.displayName}: ${error.message}`);
      this.emit('status-changed', this.status);
    });

    // After restart() a stale exit event from the old child may still fire;
    // only the current child may change kernel state.
    child.on('exit', (code, signal) => {
      if (this.process !== child) return;
      this.process = null;
      if (this.status !== 'stopped') {
        this.status = 'dead';
        this.#failAll(
          `${this.spec.displayName} kernel exited unexpectedly` +
            (signal ? ` (signal ${signal})` : code !== null ? ` (code ${code})` : '')
        );
        this.emit('status-changed', this.status);
      }
    });

    this.status = 'idle';
    this.emit('status-changed', this.status);
  }

  #handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === 'result' && this.pending.has(message.id)) {
      const { resolve } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (this.pending.size === 0 && this.status === 'busy') {
        this.status = 'idle';
        this.emit('status-changed', this.status);
      }
      resolve({
        status: message.status,
        outputs: message.outputs ?? [],
        executionCount: message.executionCount ?? null
      });
    }
  }

  #failAll(reason) {
    for (const [, { resolve }] of this.pending) {
      resolve({
        status: 'error',
        outputs: [{ type: 'error', ename: 'KernelError', evalue: reason, traceback: reason }],
        executionCount: null
      });
    }
    this.pending.clear();
  }

  /**
   * Execute code; resolves with { status, outputs, executionCount }.
   * Never rejects — kernel failures come back as error outputs so the UI
   * has one rendering path.
   */
  execute(code) {
    if (!this.process) this.start();
    if (!this.process || this.status === 'dead') {
      return Promise.resolve({
        status: 'error',
        outputs: [{
          type: 'error',
          ename: 'KernelError',
          evalue: `${this.spec.displayName} kernel is not available`,
          traceback: `${this.spec.displayName} kernel is not available`
        }],
        executionCount: null
      });
    }
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      if (this.status !== 'busy') {
        this.status = 'busy';
        this.emit('status-changed', this.status);
      }
      this.process.stdin.write(JSON.stringify({ id, type: 'execute', code }) + '\n');
    });
  }

  /** Interrupt the running cell (SIGINT). Works for the Python runner. */
  interrupt() {
    if (this.process) this.process.kill('SIGINT');
  }

  /** Stop the kernel; pending executions resolve as errors. */
  stop() {
    if (!this.process) return;
    this.status = 'stopped';
    this.#failAll('Kernel was stopped');
    this.process.kill();
    this.process = null;
    this.emit('status-changed', this.status);
  }

  /** Restart with a fresh session (all state lost). */
  restart() {
    this.stop();
    this.start();
  }
}
