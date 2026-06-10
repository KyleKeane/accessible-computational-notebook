/**
 * KernelManager — owns one persistent kernel per language. Kernels start
 * lazily on first execution and live until restarted or the app quits, which
 * is what makes notebook sessions actually persistent.
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { ProcessKernel } from './process-kernel.js';

const runnersDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runners');

export const KERNEL_SPECS = {
  python: {
    displayName: 'Python 3',
    command: os.platform() === 'win32' ? 'python' : 'python3',
    args: [path.join(runnersDir, 'python-runner.py')]
  },
  javascript: {
    displayName: 'JavaScript (Node.js)',
    command: process.execPath, // Electron binary runs as Node with this flag
    args: ['--no-deprecation', path.join(runnersDir, 'js-runner.mjs')],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  }
};

export class KernelManager extends EventEmitter {
  constructor(specs = KERNEL_SPECS) {
    super();
    this.specs = specs;
    this.kernels = new Map();
  }

  list() {
    return Object.entries(this.specs).map(([name, spec]) => ({
      name,
      displayName: spec.displayName
    }));
  }

  get(name) {
    if (!this.specs[name]) throw new Error(`Unknown kernel: ${name}`);
    if (!this.kernels.has(name)) {
      const spec = this.specs[name];
      const kernel = new ProcessKernel({
        command: spec.command,
        args: spec.args,
        env: spec.env,
        displayName: spec.displayName
      });
      kernel.on('status-changed', (status) => {
        this.emit('status-changed', { name, status });
      });
      this.kernels.set(name, kernel);
    }
    return this.kernels.get(name);
  }

  execute(name, code) {
    return this.get(name).execute(code);
  }

  interrupt(name) {
    this.kernels.get(name)?.interrupt();
  }

  restart(name) {
    this.kernels.get(name)?.restart();
  }

  status(name) {
    return this.kernels.get(name)?.status ?? 'stopped';
  }

  stopAll() {
    for (const kernel of this.kernels.values()) kernel.stop();
  }
}
