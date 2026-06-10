/**
 * Screen reader announcements. One polite and one assertive live region,
 * rate-limited so rapid-fire status changes don't drown the user.
 */

const polite = document.getElementById('announcer-polite');
const assertive = document.getElementById('announcer-assertive');

let lastText = '';
let lastTime = 0;

export function announce(text, isAssertive = false) {
  const region = isAssertive ? assertive : polite;
  const now = Date.now();
  // Re-announcing identical text requires a DOM change; a trailing space
  // toggles the content without changing what is spoken.
  region.textContent = text === lastText && now - lastTime < 5000 ? text + ' ' : text;
  lastText = text;
  lastTime = now;
}
