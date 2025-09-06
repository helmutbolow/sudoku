import { initUI, setBoard, clearBoard, fillSample } from './ui.js';
import { initAutoTheme } from './theme.js';
import { generatePuzzle } from './generator.js';
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
  const select = document.getElementById('difficulty');
  const LS_KEY = 'sudoku:difficulty';
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

  document.getElementById('clear-board').addEventListener('click', () => {
    clearBoard(api);
  });

  document.getElementById('new-puzzle').addEventListener('click', () => {
    clearBoard(api);
    const { puzzle, mask } = generatePuzzle(select.value || 'medium');
    api.writeBoard(puzzle);
    api.markPrefill(mask);
    api.setStatus(`Random puzzle loaded (${select.value})`);
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
