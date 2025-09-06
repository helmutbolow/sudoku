import { initUI, setBoard, clearBoard, fillSample } from './ui.js';
import { solve } from './solver.js';

function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onReady(() => {
  const root = document.getElementById('app');
  const api = initUI(root);

  document.getElementById('clear-board').addEventListener('click', () => {
    clearBoard(api);
  });

  document.getElementById('new-puzzle').addEventListener('click', () => {
    clearBoard(api);
    fillSample(api);
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
