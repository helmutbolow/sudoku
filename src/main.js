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
  const diffGroup = document.getElementById('difficulty-group');
  const LS_KEY = 'sudoku:difficulty';
  function setDiffUI(d) {
    diffGroup?.querySelectorAll('button').forEach((b) => {
      const isActive = b.dataset.diff === d;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    try {
      localStorage.setItem(LS_KEY, d);
    } catch {}
  }
  function getDiffUI() {
    const active = diffGroup?.querySelector('button.active');
    return active?.dataset.diff || 'medium';
  }
  const btnUndo = document.getElementById('undo');
  const btnRedo = document.getElementById('redo');
  const btnRestart = document.getElementById('restart');
  const btnCheck = document.getElementById('check');
  const errorBadge = document.getElementById('error-badge');
  const hintBadge = document.getElementById('hint-badge');
  const clockBadge = document.getElementById('clock-badge');
  const over = document.getElementById('over-overlay');
  const overText = document.getElementById('over-text');
  const overRestart = document.getElementById('over-restart');
  const overNew = document.getElementById('over-new');
  // notes removed

  // Game state
  let originalPuzzle = null; // 9x9 numbers (0 empty)
  let prefillMask = null; // 9x9 booleans
  let solutionGrid = null; // 9x9 numbers
  const history = []; // snapshots of boards
  const future = [];
  const placements = []; // strict undo stack
  let currentDifficulty = 'medium';
  let errorCount = 0;
  const ERROR_LIMIT = { easy: 3, medium: 5, hard: 9 };
  let hintCount = 0;
  let timerId = null;
  let startTime = 0;
  function updateErrorsUI() {
    if (!errorBadge) return;
    const max = ERROR_LIMIT[currentDifficulty] || 3;
    const remaining = Math.max(0, max - errorCount);
    errorBadge.textContent = `Attempts: ${remaining}/${max}`;
    errorBadge.classList.toggle('danger', remaining <= 2);
  }
  function updateHintsUI() {
    if (!hintBadge) return;
    const max = ERROR_LIMIT[currentDifficulty] || 3;
    const remaining = Math.max(0, max - hintCount);
    hintBadge.textContent = `Hints: ${remaining}/${max}`;
    hintBadge.classList.toggle('danger', remaining <= 1);
    const btnHint = document.getElementById('hint');
    if (btnHint) btnHint.disabled = remaining <= 0;
  }
  function fmtClock(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function startClock() {
    if (timerId) clearInterval(timerId);
    startTime = Date.now();
    if (clockBadge) clockBadge.textContent = '00:00';
    timerId = setInterval(() => {
      if (clockBadge) clockBadge.textContent = fmtClock(Date.now() - startTime);
    }, 1000);
  }
  function stopClock() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }
  function showGameOver() {
    if (!over) return;
    over.classList.remove('hidden');
    over.setAttribute('aria-hidden', 'false');
    if (overText) overText.textContent = `Game over — attempts exhausted`;
  }
  function hideGameOver() {
    if (!over) return;
    over.classList.add('hidden');
    over.setAttribute('aria-hidden', 'true');
  }
  function showSolved() {
    if (!over) return;
    // Do not overwrite overText here; content is prepared by checkSolved()
    over.classList.remove('hidden');
    over.setAttribute('aria-hidden', 'false');
  }
  if (overRestart) overRestart.addEventListener('click', () => btnRestart?.click());
  if (overNew)
    overNew.addEventListener('click', async () => {
      const difficulty = getDiffUI() || currentDifficulty || 'medium';
      await loadNewByDifficulty(difficulty);
      hideGameOver();
    });

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
    if (btnCheck) btnCheck.disabled = true;
    if (solutionGrid) updateErrorsUI();
    // Always refresh hints badge
    if (typeof updateHintsUI === 'function') updateHintsUI();
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
    // Reset counters based on difficulty
    errorCount = 0;
    hintCount = 0;
    updateActionButtons();
    updateErrorsUI();
    hideGameOver();
    startClock();
  }

  function lbKey(d) {
    return `sudoku:best:${d}`;
  }
  function loadBestTimes(d) {
    try {
      const raw = localStorage.getItem(lbKey(d));
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function computeScore(ms, errors, hints, difficulty) {
    const base = { easy: 1000, medium: 2000, hard: 3000 }[difficulty] || 1500;
    const timePenalty = Math.floor(ms / 1000); // 1 point per second
    const errPenalty = errors * 50;
    const hintPenalty = hints * 80;
    const raw = Math.max(0, base - timePenalty - errPenalty - hintPenalty);
    // Normalize IQ around 100 with a spread; purely cosmetic
    const iq = Math.max(60, Math.min(160, 60 + Math.floor(raw / 20)));
    return { score: raw, iq };
  }

  function saveBestTime(d, ms, errors, hints) {
    try {
      const arr = loadBestTimes(d);
      const { score, iq } = computeScore(ms, errors, hints, d);
      arr.push({ ms, errors, hints, score, iq, ts: Date.now() });
      arr.sort((a, b) => a.ms - b.ms || a.errors - b.errors || a.hints - b.hints);
      localStorage.setItem(lbKey(d), JSON.stringify(arr.slice(0, 10)));
    } catch {}
  }

  let ignoreNextRecord = false; // set true when Solve button used

  function checkSolved(saveRecord = true) {
    if (!solutionGrid) return false;
    const b = api.readBoard();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (b[r][c] !== solutionGrid[r][c]) return false;
      }
    }
    // All cells match solution
    stopClock();
    if (api.setEnabled) api.setEnabled(false);
    const elapsed = startTime ? Date.now() - startTime : 0;
    const { score, iq } = computeScore(elapsed, errorCount, hintCount, currentDifficulty);
    api.setStatus(
      `Solved! Time ${fmtClock(elapsed)}. Errors ${errorCount}. Hints ${hintCount}. Score ${score}, IQ ${iq}.`
    );
    if (!ignoreNextRecord && saveRecord) {
      // store record and show top list
      saveBestTime(currentDifficulty, elapsed, errorCount, hintCount);
    } else {
      // reset the flag; do not save this auto-solve time
      ignoreNextRecord = false;
    }
    const best = loadBestTimes(currentDifficulty);
    if (overText) {
      const top = best
        .slice(0, 5)
        .map(
          (r, i) =>
            `${i + 1}. ${fmtClock(r.ms)} (E${r.errors}, H${r.hints}, S${r.score ?? '-'}, IQ${r.iq ?? '-'})`
        )
        .join('<br/>');
      overText.innerHTML = `Solved!<br/>Time ${fmtClock(elapsed)} — Errors ${errorCount}, Hints ${hintCount}, Score ${score}, IQ ${iq}<br/><br/>Best ${currentDifficulty}:<br/>${top}`;
    }
    showSolved();
    return true;
  }
  function pushHistoryFromCurrent() {
    const current = api.readBoard();
    if (!history.length || !boardsEqual(history[history.length - 1], current)) {
      history.push(cloneBoard(current));
      future.length = 0;
      updateActionButtons();
    }
  }
  // restore last selection and wire segmented control
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setDiffUI(saved);
  } catch {}
  diffGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-diff]');
    if (!btn) return;
    setDiffUI(btn.dataset.diff);
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
    const difficulty = getDiffUI();
    await loadNewByDifficulty(difficulty);
  });

  document.getElementById('hint').addEventListener('click', () => {
    if (!solutionGrid) return;
    const maxHints = ERROR_LIMIT[currentDifficulty] || 3;
    if (hintCount >= maxHints) {
      updateHintsUI();
      return;
    }
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
    // consume one hint independently
    hintCount = Math.min(maxHints, hintCount + 1);
    updateHintsUI();
    checkSolved();
  });

  document.getElementById('solve-board').addEventListener('click', () => {
    const board = api.readBoard();
    const solved = solutionGrid || solve(board);
    if (!solved) {
      api.setStatus('No solution found or invalid puzzle.');
      return;
    }
    setBoard(api, solved);
    solutionGrid = solved;
    ignoreNextRecord = true; // disregard best time for auto-solve
    checkSolved(false);
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
    // detect solved
    checkSolved(true);
  });

  // Strict error counting
  const lastWrong = new Map(); // idx -> digit last tried
  api.boardEl.addEventListener('strict-error', (e) => {
    const d = e.detail || {};
    const idx = typeof d.idx === 'number' ? d.idx : -1;
    const digit = typeof d.digit === 'number' ? d.digit : null;
    const r = idx >= 0 ? Math.floor(idx / 9) + 1 : null;
    const c = idx >= 0 ? (idx % 9) + 1 : null;
    const prev = lastWrong.get(idx);
    // Avoid double-counting same wrong digit on same cell
    if (digit !== null && prev === digit) {
      api.setStatus(
        `Still wrong: ${digit} at R${r}C${c} — Errors: ${errorCount}/${ERROR_LIMIT[currentDifficulty]}`
      );
      return;
    }
    if (digit !== null) lastWrong.set(idx, digit);
    errorCount++;
    const max = ERROR_LIMIT[currentDifficulty] || 3;
    if (errorCount >= max) {
      api.setStatus(`Game over — errors: ${errorCount}/${max}`);
      if (api.setEnabled) api.setEnabled(false);
      updateErrorsUI();
      stopClock();
      showGameOver();
    } else {
      if (r && c && digit !== null) api.setStatus(`Wrong: ${digit} at R${r}C${c}`);
      updateErrorsUI();
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
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setDiffUI(saved);
      const difficulty = getDiffUI() || 'medium';
      await loadNewByDifficulty(difficulty);
    } catch {}
  })();
});
