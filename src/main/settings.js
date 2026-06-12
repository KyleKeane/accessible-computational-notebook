/**
 * Settings persistence: a JSON file in the user-data directory. Validation
 * lives in src/core/settings.js; this module only does I/O.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS, normalizeSettings } from '../core/settings.js';

export class SettingsStore {
  constructor(directory) {
    this.file = path.join(directory, 'settings.json');
    this.values = { ...DEFAULT_SETTINGS };
  }

  async load() {
    try {
      this.values = normalizeSettings(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch {
      this.values = { ...DEFAULT_SETTINGS };
    }
    return this.values;
  }

  async save(raw) {
    this.values = normalizeSettings(raw);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.values, null, 2) + '\n', 'utf8');
    return this.values;
  }
}
