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
  const btnUndo = document.getElementById('undo');
  const btnRedo = document.getElementById('redo');
  const btnRestart = document.getElementById('restart');
  const btnCheck = document.getElementById('check');
  const LS_KEY = 'sudoku:difficulty';
  const LS_NOTES = 'sudoku:notes';

  // Game state
  let originalPuzzle = null; // 9x9 numbers (0 empty)
  let prefillMask = null; // 9x9 booleans
  let solutionGrid = null; // 9x9 numbers
  const history = []; // snapshots of boards
  const future = [];

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
    history.length = 0;
    history.push(cloneBoard(originalPuzzle));
    future.length = 0;
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

  document.getElementById('new-puzzle').addEventListener('click', async () => {
    // clear any mistake highlights
    [...api.boardEl.children].forEach((el) => el.classList.remove('mistake'));
    const difficulty = select.value || 'medium';
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
  });

  document.getElementById('hint').addEventListener('click', () => {
    api.hint();
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

  // Undo/Redo/Restart/Check handlers
  if (btnUndo)
    btnUndo.addEventListener('click', () => {
      if (history.length > 1) {
        const current = history.pop();
        future.push(current);
        applySnapshot(history[history.length - 1]);
        api.setStatus('Undid move');
        updateActionButtons();
      }
    });
  if (btnRedo)
    btnRedo.addEventListener('click', () => {
      if (future.length) {
        const next = future.pop();
        history.push(next);
        applySnapshot(next);
        api.setStatus('Redid move');
        updateActionButtons();
      }
    });
  if (btnRestart)
    btnRestart.addEventListener('click', () => {
      if (!originalPuzzle) return;
      setNewPuzzle(originalPuzzle, prefillMask, solutionGrid);
      api.setStatus('Puzzle restarted');
    });
  if (btnCheck)
    btnCheck.addEventListener('click', () => {
      if (!solutionGrid) return;
      const board = api.readBoard();
      let wrong = 0;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const idx = r * 9 + c;
          const cell = api.boardEl.children[idx];
          const input = cell.querySelector('input');
          if (input.readOnly) {
            cell.classList.remove('mistake');
            continue;
          }
          if (board[r][c] !== 0 && board[r][c] !== solutionGrid[r][c]) {
            cell.classList.add('mistake');
            wrong++;
          } else {
            cell.classList.remove('mistake');
          }
        }
      }
      api.setStatus(wrong ? `Mistakes: ${wrong}` : 'No mistakes so far!');
    });

  // Snapshot on user edit
  api.boardEl.addEventListener('cell-change', () => {
    // clear mistake highlights on edit
    [...api.boardEl.children].forEach((el) => el.classList.remove('mistake'));
    pushHistoryFromCurrent();
  });

  // Power-user keys
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'u') {
      btnUndo?.click();
      e.preventDefault();
    } else if (k === 'r') {
      btnRedo?.click();
      e.preventDefault();
    } else if (k === 'x') {
      btnRestart?.click();
      e.preventDefault();
    }
  });

  // Load an initial sample
  fillSample(api);
  // Initialize game state for sample
  try {
    originalPuzzle = api.readBoard();
    prefillMask = Array.from({ length: 9 }, (_, r) =>
      Array.from({ length: 9 }, (_, c) => originalPuzzle[r][c] !== 0)
    );
    solutionGrid = solve(originalPuzzle);
    history.push(cloneBoard(originalPuzzle));
    updateActionButtons();
  } catch {}
});
