import { initUI, setBoard, clearBoard, fillSample } from './ui.js';
import { initAutoTheme } from './theme.js';
import { generatePuzzle } from './generator.js';
import { primePool, getFromPool, generateOneAsync } from './pool.js';
import { solve } from './solver.js';

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(() => {
  // Auto theme based on local time
  initAutoTheme();

  const root = document.getElementById('app');
  const api = initUI(root);
  // warm pool in background
  primePool('easy');
  primePool('medium');
  primePool('hard');
  const select = document.getElementById('difficulty');
  const notesBtn = document.getElementById('notes-toggle');
  const LS_KEY = 'sudoku:difficulty';
  const LS_NOTES = 'sudoku:notes';
  // restore last selection
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) select.value = saved;
  } catch {}
  select.addEventListener('change', () => {
    try {
      localStorage.setItem(LS_KEY, select.value);
    } catch {}
  });

  // notes toggle
  try {
    const savedNotes = localStorage.getItem(LS_NOTES);
    if (savedNotes) {
      const on = savedNotes === '1';
      api.setNotesMode(on);
      notesBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  } catch {}
  notesBtn.addEventListener('click', () => {
    const on = notesBtn.getAttribute('aria-pressed') !== 'true';
    notesBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    api.setNotesMode(on);
    try {
      localStorage.setItem(LS_NOTES, on ? '1' : '0');
    } catch {}
  });
  // Reflect keyboard toggle
  root.addEventListener('notes-toggle', (e) => {
    const on = !!e.detail?.on;
    notesBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    try {
      localStorage.setItem(LS_NOTES, on ? '1' : '0');
    } catch {}
  });

  document.getElementById('clear-board').addEventListener('click', () => {
    clearBoard(api);
  });

  let genAbort = null;
  const overlay = document.getElementById('gen-overlay');
  const btnCancel = document.getElementById('gen-cancel');
  function showOverlay(show) {
    overlay.classList.toggle('hidden', !show);
    overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  btnCancel.addEventListener('click', () => {
    if (genAbort) genAbort.abort();
  });

  document.getElementById('new-puzzle').addEventListener('click', async () => {
    clearBoard(api);
    const difficulty = select.value || 'medium';
    const cached = getFromPool(difficulty);
    if (cached) {
      api.writeBoard(cached.puzzle);
      api.markPrefill(cached.mask);
      api.setStatus(`Random puzzle loaded (${difficulty})`);
      return;
    }
    // Generate async with cancel
    const controller = new AbortController();
    genAbort = controller;
    showOverlay(true);
    api.setStatus('Generating…');
    try {
      const next = await generateOneAsync(difficulty, controller.signal);
      api.writeBoard(next.puzzle);
      api.markPrefill(next.mask);
      api.setStatus(`Random puzzle loaded (${difficulty})`);
      // top up pool
      primePool(difficulty);
    } catch (e) {
      api.setStatus('Generation canceled');
    } finally {
      showOverlay(false);
      genAbort = null;
    }
  });

  document.getElementById('hint').addEventListener('click', () => {
    api.hint();
  });

  document.getElementById('solve-board').addEventListener('click', () => {
    const board = api.readBoard();
    const solved = solve(board);
    if (!solved) {
      api.setStatus('No solution found or invalid puzzle.');
      return;
    }
    setBoard(api, solved);
    api.setStatus('Solved!');
  });

  // Load an initial sample
  fillSample(api);
});
