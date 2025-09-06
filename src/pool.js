// Puzzle pool with background pre-generation and optional persistence.
import { generatePuzzle } from './generator.js';

const targetPerDifficulty = { easy: 3, medium: 3, hard: 2 };
const pool = { easy: [], medium: [], hard: [] };
const busy = { easy: false, medium: false, hard: false };

function lsKey(d) {
  return `sudoku:pool:${d}`;
}

function loadFromLS() {
  ['easy', 'medium', 'hard'].forEach((d) => {
    try {
      const raw = localStorage.getItem(lsKey(d));
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) pool[d] = arr.concat(pool[d]).slice(0, targetPerDifficulty[d]);
      }
    } catch {}
  });
}

function saveToLS(d) {
  try {
    localStorage.setItem(lsKey(d), JSON.stringify(pool[d].slice(0, targetPerDifficulty[d])));
  } catch {}
}

loadFromLS();

export function primePool(difficulty, count = targetPerDifficulty[difficulty] || 2) {
  if (busy[difficulty]) return;
  busy[difficulty] = true;
  const desired = Math.max(count, targetPerDifficulty[difficulty] || 2);
  const run = () => {
    if (pool[difficulty].length >= desired) {
      busy[difficulty] = false;
      saveToLS(difficulty);
      return;
    }
    setTimeout(() => {
      try {
        const { puzzle, mask, solution } = generatePuzzle(difficulty);
        pool[difficulty].push({ puzzle, mask, solution, difficulty, ts: Date.now() });
      } catch (e) {
        // ignore and keep trying next tick
      }
      run();
    }, 0);
  };
  run();
}

export function getFromPool(difficulty) {
  const item = pool[difficulty].shift() || null;
  if (item) saveToLS(difficulty);
  // Top back up in background
  primePool(difficulty);
  return item;
}

export function generateOneAsync(difficulty, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });
    setTimeout(() => {
      try {
        const { puzzle, mask, solution } = generatePuzzle(difficulty);
        resolve({ puzzle, mask, solution, difficulty, ts: Date.now() });
      } catch (e) {
        reject(e);
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    }, 0);
  });
}
