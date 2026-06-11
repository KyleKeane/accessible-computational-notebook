/**
 * Screen reader announcements. One polite live region for status, one
 * assertive region for errors — the only two in the app.
 */

const polite = document.getElementById('announcer-polite');
const assertive = document.getElementById('announcer-assertive');

// Speech is ephemeral; the history dialog (Ctrl+Shift+L) lets a user
// review anything they missed.
const history = [];

export function announce(text, isAssertive = false) {
  // A modal <dialog> makes the rest of the page inert, which silences the
  // main live regions; each dialog carries its own announcer for that case.
  const modalRegion = document.querySelector('dialog:modal .dialog-announcer');
  const region = modalRegion ?? (isAssertive ? assertive : polite);
  // Live regions only speak on a DOM change, so re-announcing identical
  // text needs a mutation; toggling a trailing space against the region's
  // CURRENT content guarantees every call mutates (comparing against
  // anything else can produce a no-op write that is silently swallowed).
  region.textContent = region.textContent === text ? text + ' ' : text;
  history.push({ time: new Date(), text, assertive: isAssertive });
  if (history.length > 100) history.shift();
}

/** Most recent first. */
export function announcementHistory() {
  return [...history].reverse();
}
