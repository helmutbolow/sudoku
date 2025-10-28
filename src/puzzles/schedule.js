import { getPuzzleById } from './catalog.js';

const ROTATION = {
  easy: [
    { start: '2025-02-01', id: 'classic-easy-001' },
    { start: '2025-02-08', id: 'classic-easy-002' },
  ],
  medium: [
    { start: '2025-02-01', id: 'classic-medium-001' },
    { start: '2025-02-08', id: 'classic-medium-002' },
  ],
  hard: [
    { start: '2025-02-01', id: 'classic-hard-001' },
    { start: '2025-02-08', id: 'classic-hard-002' },
    { start: '2025-02-10', id: 'diagonal-hard-001' },
    { start: '2025-02-12', id: 'irregular-hard-001' },
  ],
  impossible: [{ start: '2025-02-01', id: 'killer-impossible-001' }],
};

const STORAGE_PREFIX = 'sudoku:schedule:v1:';

function toISODate(date) {
  if (!date) return null;
  if (typeof date === 'string') return date;
  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function getStorageKey(difficulty, isoDate) {
  return `${STORAGE_PREFIX}${difficulty}:${isoDate}`;
}

function isMarked(difficulty, isoDate, id) {
  const key = getStorageKey(difficulty, isoDate);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    return raw === id;
  } catch {
    return false;
  }
}

function mark(difficulty, isoDate, id) {
  const key = getStorageKey(difficulty, isoDate);
  try {
    localStorage.setItem(key, id);
  } catch {
    // ignore storage errors (private browsing, quota, etc.)
  }
}

function findActiveEntry(entries, isoDate) {
  if (!Array.isArray(entries) || !entries.length) return null;
  let selected = null;
  for (const entry of entries) {
    if (!entry?.start || !entry?.id) continue;
    if (entry.start <= isoDate) selected = entry;
  }
  return selected;
}

export function getScheduledPuzzleForDate(date, difficulty) {
  const iso = toISODate(date);
  if (!iso) return null;
  const entries = ROTATION[difficulty];
  if (!entries) return null;
  const entry = findActiveEntry(entries, iso);
  if (!entry) return null;
  if (isMarked(difficulty, iso, entry.id)) return null;
  const puzzle = getPuzzleById(entry.id);
  if (!puzzle || puzzle.size !== 9) return null;
  return {
    ...puzzle,
    schedule: { difficulty, iso, id: entry.id },
  };
}

export function markScheduledPuzzleConsumed(scheduleInfo) {
  if (!scheduleInfo) return;
  const { difficulty, iso, id } = scheduleInfo;
  if (!difficulty || !iso || !id) return;
  mark(difficulty, iso, id);
}

export function previewRotation() {
  return Object.entries(ROTATION).map(([difficulty, entries]) => ({
    difficulty,
    entries: entries.map((entry) => ({ ...entry })),
  }));
}
