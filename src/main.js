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
  const btnUndo = document.getElementById('undo');
  const btnRedo = document.getElementById('redo');
  const btnRestart = document.getElementById('restart');
  const btnCheck = document.getElementById('check');
  const LS_KEY = 'sudoku:difficulty';
  // notes removed

  // Game state
  let originalPuzzle = null; // 9x9 numbers (0 empty)
  let prefillMask = null; // 9x9 booleans
  let solutionGrid = null; // 9x9 numbers
  const history = []; // snapshots of boards
  const future = [];
  let currentDifficulty = 'medium';
  let errorCount = 0;
  const ERROR_LIMIT = { easy: 3, medium: 5, hard: 9 };

  function cloneBoard(b) {
    return b.map((row) => row.slice());
  }
  function boardsEqual(a, b) {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (a[r][c] !== b[r][c]) return false;
    return true;
  }
  function updateActionButtons() {
    if (btnUndo) btnUndo.disabled = history.length <= 1;
    if (btnRedo) btnRedo.disabled = future.length === 0;
    if (btnRestart) btnRestart.disabled = !originalPuzzle;
    if (btnCheck) btnCheck.disabled = !solutionGrid;
    // Update status with error counter if solution known
    if (solutionGrid) api.setStatus(`Errors: ${errorCount}/${ERROR_LIMIT[currentDifficulty]}`);
  }
  function applySnapshot(b) {
    // write board and re-apply mask
    api.writeBoard(b);
    if (prefillMask) api.markPrefill(prefillMask);
  }
  function setNewPuzzle(puz, mask, solution) {
    originalPuzzle = cloneBoard(puz);
    prefillMask = mask.map((row) => row.slice());
    solutionGrid = cloneBoard(solution);
    applySnapshot(originalPuzzle);
    // Provide solution to UI for real-time mistake detection
    if (api.setSolution) api.setSolution(solutionGrid);
    history.length = 0;
    history.push(cloneBoard(originalPuzzle));
    future.length = 0;
    // Reset errors based on difficulty
    errorCount = 0;
    updateActionButtons();
  }
  function pushHistoryFromCurrent() {
    const current = api.readBoard();
    if (!history.length || !boardsEqual(history[history.length - 1], current)) {
      history.push(cloneBoard(current));
      future.length = 0;
      updateActionButtons();
    }
  }
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

  // notes removed

  // remove legacy clear button if present

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

  async function loadNewByDifficulty(difficulty) {
    currentDifficulty = difficulty;
    // clear any mistake highlights
    [...api.boardEl.children].forEach((el) => el.classList.remove('mistake'));
    const cached = getFromPool(difficulty);
    if (cached) {
      setNewPuzzle(cached.puzzle, cached.mask, cached.solution);
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
      setNewPuzzle(next.puzzle, next.mask, next.solution);
      api.setStatus(`Random puzzle loaded (${difficulty})`);
      // top up pool
      primePool(difficulty);
    } catch (e) {
      api.setStatus('Generation canceled');
    } finally {
      showOverlay(false);
      genAbort = null;
      updateActionButtons();
    }
  }

  document.getElementById('new-puzzle').addEventListener('click', async () => {
    const difficulty = select.value || 'medium';
    await loadNewByDifficulty(difficulty);
  });

  document.getElementById('hint').addEventListener('click', () => {
    if (!solutionGrid) return;
    let filled = false;
    const selInput = api.boardEl.querySelector('.cell.selected input');
    if (selInput) {
      const cell = selInput.parentElement;
      const r = Number(cell.dataset.row),
        c = Number(cell.dataset.col);
      if (!selInput.readOnly && !selInput.value) {
        selInput.value = String(solutionGrid[r][c]);
        api.boardEl.dispatchEvent(
          new CustomEvent('cell-change', {
            bubbles: true,
            detail: { idx: r * 9 + c, oldVal: '', newVal: selInput.value },
          })
        );
        filled = true;
      }
    }
    if (!filled) {
      outer: for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) {
          const idx = r * 9 + c;
          const cell = api.boardEl.children[idx];
          const input = cell.querySelector('input');
          if (!input.readOnly && !input.value) {
            input.value = String(solutionGrid[r][c]);
            api.boardEl.dispatchEvent(
              new CustomEvent('cell-change', {
                bubbles: true,
                detail: { idx, oldVal: '', newVal: input.value },
              })
            );
            filled = true;
            break outer;
          }
        }
    }
    // count as soft error
    errorCount++;
    const max = ERROR_LIMIT[currentDifficulty] || 3;
    if (errorCount >= max) {
      api.setStatus(`Game over — errors: ${errorCount}/${max}`);
      if (api.setEnabled) api.setEnabled(false);
    } else {
      api.setStatus(`Errors: ${errorCount}/${max}`);
    }
  });

  document.getElementById('solve-board').addEventListener('click', () => {
    const board = api.readBoard();
    const solved = solutionGrid || solve(board);
    if (!solved) {
      api.setStatus('No solution found or invalid puzzle.');
      return;
    }
    setBoard(api, solved);
    api.setStatus('Solved!');
    pushHistoryFromCurrent();
  });

  // Undo/Restart handlers (Redo removed)
  if (btnUndo)
    btnUndo.addEventListener('click', () => {
      // Clear only the last placed entry; do not refill erased cells
      if (!placements.length) return;
      while (placements.length) {
        const idx = placements.pop();
        const cell = api.boardEl.children[idx];
        const input = cell.querySelector('input');
        if (input && !input.readOnly && input.value) {
          const old = input.value;
          input.value = '';
          api.boardEl.dispatchEvent(
            new CustomEvent('cell-change', {
              bubbles: true,
              detail: { idx, oldVal: old, newVal: '' },
            })
          );
          api.setStatus('Undid last entry');
          break;
        }
      }
    });
  if (btnRestart)
    btnRestart.addEventListener('click', () => {
      if (!originalPuzzle) return;
      setNewPuzzle(originalPuzzle, prefillMask, solutionGrid);
      api.setStatus('Puzzle restarted');
    });
  // Check removed

  // Snapshot on user edit
  api.boardEl.addEventListener('cell-change', () => {
    // clear mistake highlights on edit
    [...api.boardEl.children].forEach((el) => el.classList.remove('mistake'));
    pushHistoryFromCurrent();
  });

  // Strict error counting
  api.boardEl.addEventListener('strict-error', () => {
    errorCount++;
    const max = ERROR_LIMIT[currentDifficulty] || 3;
    if (errorCount >= max) {
      api.setStatus(`Game over — errors: ${errorCount}/${max}`);
      if (api.setEnabled) api.setEnabled(false);
    } else {
      api.setStatus(`Errors: ${errorCount}/${max}`);
    }
  });

  // Power-user keys
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'u') {
      btnUndo?.click();
      e.preventDefault();
    } else if (k === 'x') {
      btnRestart?.click();
      e.preventDefault();
    }
  });

  // Load initial puzzle for selected difficulty
  (async () => {
    try {
      const difficulty = select.value || 'medium';
      await loadNewByDifficulty(difficulty);
    } catch {}
  })();
});
