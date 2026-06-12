/**
 * Settings: defaults and validation. Pure functions — loading/saving the
 * settings file is the main process's job (src/main/settings.js).
 */

export const DEFAULT_SETTINGS = {
  /** Maximum seconds a cell may run before it is stopped. 0 = no limit. */
  executionTimeoutSeconds: 0,
  /** Output shorter than this is announced verbatim; longer is summarized. */
  maxAnnouncedOutputLength: 160,
  /** How often unsaved work is written to the recovery file. 0 = off. */
  autosaveIntervalSeconds: 30
};

function clampNumber(value, fallback, { min, max }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Coerce arbitrary input into a complete, valid settings object. */
export function normalizeSettings(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    executionTimeoutSeconds: clampNumber(
      input.executionTimeoutSeconds,
      DEFAULT_SETTINGS.executionTimeoutSeconds,
      { min: 0, max: 86400 }
    ),
    maxAnnouncedOutputLength: clampNumber(
      input.maxAnnouncedOutputLength,
      DEFAULT_SETTINGS.maxAnnouncedOutputLength,
      { min: 0, max: 10000 }
    ),
    autosaveIntervalSeconds: clampNumber(
      input.autosaveIntervalSeconds,
      DEFAULT_SETTINGS.autosaveIntervalSeconds,
      { min: 0, max: 3600 }
    )
  };
}
