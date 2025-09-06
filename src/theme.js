// Sets theme based on local time (day/night) and updates meta color.

const DAY_HOUR_START = 7; // 07:00 local time
const DAY_HOUR_END = 19; // 19:59 is still day

function computeTheme() {
  const hour = new Date().getHours();
  return hour >= DAY_HOUR_START && hour < DAY_HOUR_END ? 'day' : 'night';
}

function setMetaThemeColor(color) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme === 'day' ? 'day' : 'night');
  // Update theme-color to match panel bg for nicer mobile UI color
  const styles = getComputedStyle(root);
  setMetaThemeColor(styles.getPropertyValue('--panel').trim());
}

export function initAutoTheme() {
  function update() {
    applyTheme(computeTheme());
  }
  update();
  // Re-evaluate periodically in case the hour flips while app is open
  setInterval(update, 5 * 60 * 1000); // every 5 minutes
}
