//test git prettier config 2
import { initUI, setBoard, clearBoard, fillSample } from './ui.js';
import { initAutoTheme } from './theme.js';
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
  const btnRestart = document.getElementById('restart');
  const errorBadge = document.getElementById('error-badge');
  const hintBadge = document.getElementById('hint-badge');
  const clockBadge = document.getElementById('clock-badge');
  const over = document.getElementById('over-overlay');
  const overText = document.getElementById('over-text');
  const overRestart = document.getElementById('over-restart');
  const overNew = document.getElementById('over-new');

  // Game state
  let originalPuzzle = null; // 9x9 numbers (0 empty)
  let prefillMask = null; // 9x9 booleans
  let solutionGrid = null; // 9x9 numbers
  const history = []; // snapshots of boards
  let currentDifficulty = 'medium';
  let errorCount = 0;
  const ERROR_LIMIT = { easy: 3, medium: 5, hard: 9 };
  const HINT_LIMIT = { easy: 1, medium: 3, hard: 6 };
  let hintCount = 0;
  let timerId = null;
  let startTime = 0;
  // Accumulated elapsed time while paused (ms)
  let elapsedBeforePause = 0;
  // State flags
  let isSystemSolved = false; // set when Solve button fills the board
  let isUserCompleted = false; // set when the USER legitimately completes the puzzle

  function updateErrorsUI() {
    if (!errorBadge) return;
    const max = ERROR_LIMIT[currentDifficulty] || 3;
    const remaining = Math.max(0, max - errorCount);
    errorBadge.textContent = `Errors: ${remaining}/${max}`;
    errorBadge.classList.toggle('danger', remaining <= 2);
  }
  function updateHintsUI() {
    if (!hintBadge) return;
    const max = HINT_LIMIT[currentDifficulty] || 3;
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
    // If resuming from pause, honor accumulated elapsed
    startTime = Date.now() - (elapsedBeforePause || 0);
    if (clockBadge) clockBadge.textContent = fmtClock(Date.now() - startTime);
    timerId = setInterval(() => {
      if (clockBadge) clockBadge.textContent = fmtClock(Date.now() - startTime);
    }, 1000);
  }
  function stopClock() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function isOverlayVisible(el) {
    if (!el) return false;
    // Guard on both class and aria state; tolerate either being the source of truth
    const cls = !el.classList.contains('hidden');
    const aria = el.getAttribute('aria-hidden') !== 'true';
    return cls && aria;
  } // --- Pause overlay orchestration
  // Use a unique name to avoid duplicate/ambiguous isPaused() definitions
  function isPauseOverlayVisible() {
    return isOverlayVisible(document.getElementById('pause-overlay'));
  }

  // --- Unified input gating (enable inputs only when NO blocking overlay is visible)
  function isConfirmVisible() {
    return isOverlayVisible(document.getElementById('confirm-overlay'));
  }
  function isGenVisible() {
    return isOverlayVisible(document.getElementById('gen-overlay'));
  }
  // isSolvedOverlayVisible() already exists below; don't redeclare it.
  function isAnyBlockingOverlayVisible() {
    return (
      isPauseOverlayVisible() || isConfirmVisible() || isGenVisible() || isSolvedOverlayVisible()
    );
  }
  function syncInputEnabled() {
    if (!api || !api.setEnabled) return;
    api.setEnabled(!isAnyBlockingOverlayVisible());
  }

  // Returns true when the "solved" (game over) overlay is currently shown
  function isSolvedOverlayVisible() {
    return isOverlayVisible(document.getElementById('over-overlay'));
  }

  function showPause() {
    const ov = document.getElementById('pause-overlay');
    if (!ov || isPauseOverlayVisible()) return;
    // Snapshot elapsed and freeze the clock
    elapsedBeforePause = Math.max(0, Date.now() - startTime);
    stopClock();

    // reflect gating with the overlay about to show
    syncInputEnabled();
    ov.classList.remove('hidden');
    ov.setAttribute('aria-hidden', 'false');
    // overlay now visible -> inputs must remain disabled
    syncInputEnabled();
  }
  function hidePause() {
    const ov = document.getElementById('pause-overlay');

    if (!ov || !isPauseOverlayVisible()) return;
    ov.classList.add('hidden');
    ov.setAttribute('aria-hidden', 'true');

    syncInputEnabled();
    startClock(); // resumes from elapsedBeforePause
    // Ensure final enablement after DOM paints
    setTimeout(syncInputEnabled, 0);
  }

  // Wire buttons
  const btnPause = document.getElementById('pause');
  const btnPauseResume = document.getElementById('pause-resume');

  if (btnPause) {
    btnPause.addEventListener('click', () => {
      if (isPauseOverlayVisible()) hidePause();
      else showPause();
    });
  }
  if (btnPauseResume) {
    btnPauseResume.addEventListener('click', hidePause);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !isPauseOverlayVisible()) showPause();
  });
  window.addEventListener('blur', () => {
    if (!isPauseOverlayVisible()) showPause();
  });
  // --- Confirm overlay (clock-aware)
  const confirmOv = document.getElementById('confirm-overlay');
  const confirmText = document.getElementById('confirm-text');
  const confirmYes = document.getElementById('confirm-yes');
  const confirmNo = document.getElementById('confirm-no');
  let confirmAction = null;
  let confirmWasTicking = false;

  function openConfirm(message, onYes) {
    if (!confirmOv) return;
    if (confirmText) confirmText.textContent = message || 'Continue?';
    confirmAction = typeof onYes === 'function' ? onYes : null;
    confirmWasTicking = !!timerId && !isPauseOverlayVisible();
    if (confirmWasTicking) {
      // Accumulate elapsed and freeze clock
      elapsedBeforePause = Math.max(0, Date.now() - startTime);
      stopClock();
    }
    syncInputEnabled();
    confirmOv.classList.remove('hidden');
    confirmOv.setAttribute('aria-hidden', 'false');
    // overlay now visible -> inputs must remain disabled
    syncInputEnabled();
  }
  function closeConfirm({ executed } = { executed: false }) {
    if (!confirmOv) return;
    confirmOv.classList.add('hidden');
    confirmOv.setAttribute('aria-hidden', 'true');
    // If user cancelled (executed === false) and game was running before confirm, resume
    if (!executed && confirmWasTicking) {
      syncInputEnabled();
      startClock(); // resumes from elapsedBeforePause
    } else if (!executed && !confirmWasTicking) {
      // We were already paused before confirm; remain paused & inputs remain disabled by pause overlay
    }
    // Clear callback & snapshot
    confirmAction = null;
    confirmWasTicking = false;
    // final sync, in case other overlays changed while confirm was open
    syncInputEnabled();
  }
  if (confirmNo) {
    confirmNo.addEventListener('click', () => closeConfirm({ executed: false }));
  }
  if (confirmYes) {
    confirmYes.addEventListener('click', async () => {
      const fn = confirmAction;
      // Close first; don't resume old clock — the action will reset/start as needed
      closeConfirm({ executed: true });
      if (typeof fn === 'function') {
        await fn();
      }
    });
  }

  function showGameOver() {
    if (!over) return;
    over.classList.remove('hidden');
    over.setAttribute('aria-hidden', 'false');
    if (overText) overText.textContent = `Game over — errors exhausted`;
    syncInputEnabled();
  }
  function hideGameOver() {
    if (!over) return;
    over.classList.add('hidden');
    over.setAttribute('aria-hidden', 'true');
    syncInputEnabled();
  }
  function showSolved() {
    if (!over) return;
    // Do not overwrite overText here; content is prepared by checkSolved()
    over.classList.remove('hidden');
    over.setAttribute('aria-hidden', 'false');
    syncInputEnabled();
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
    if (btnRestart) btnRestart.disabled = !originalPuzzle;
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
    // Reset counters based on difficulty
    errorCount = 0;
    hintCount = 0;
    updateActionButtons();
    updateErrorsUI();
    hideGameOver();
    // Reset pause accumulator on fresh puzzle
    elapsedBeforePause = 0;
    startClock();
    // Hard reset any lingering selection/highlights (“bubbles”)
    if (api.clearHighlights) api.clearHighlights();
    if (api.selectCell) api.selectCell(null);
    // Reset “solved” state and re-enable controls
    isSystemSolved = false;
    isUserCompleted = false;
    const btnHint = document.getElementById('hint');
    const btnPause = document.getElementById('pause');
    const btnSolve = document.getElementById('solve-board');
    const btnUndo = document.getElementById('undo');
    if (btnHint) btnHint.removeAttribute('disabled');
    if (btnPause) btnPause.removeAttribute('disabled');
    if (btnSolve) btnSolve.removeAttribute('disabled');
    if (btnUndo) btnUndo.removeAttribute('disabled');
    syncInputEnabled();
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
    // Expected finish times (seconds) by difficulty
    const EXPECTED_SECS = { easy: 10 * 60, medium: 18 * 60, hard: 28 * 60 };
    const errPenaltySec = 30; // each error ~30s
    const hintPenaltySec = 45; // each hint ~45s

    const t = Math.max(1, Math.floor(ms / 1000)); // guard
    const expected = EXPECTED_SECS[difficulty] ?? EXPECTED_SECS.medium;

    // Convert mistakes/hints into time-equivalent penalties
    const effective = t + errors * errPenaltySec + hints * hintPenaltySec;

    // Normalized performance: >1 means faster/better than baseline
    const ratio = expected / effective;

    // Score: scale around 1000 at baseline, higher if faster
    const score = Math.max(0, Math.round(1000 * ratio));

    // IQ: clamp 60–160, centered at 100; log keeps scaling sane
    const iq = Math.max(60, Math.min(160, Math.round(100 + 20 * Math.log2(ratio))));

    return { score, iq };
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

  function checkSolved(saveRecord = true) {
    if (!solutionGrid) return false;
    const b = api.readBoard();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (b[r][c] !== solutionGrid[r][c]) return false;
      }
    }
    // All cells match solution
    isUserCompleted = true;
    stopClock();
    const elapsed = startTime ? Date.now() - startTime : 0;
    const { score, iq } = computeScore(elapsed, errorCount, hintCount, currentDifficulty);
    api.setStatus(
      `Solved! Time ${fmtClock(elapsed)}. Errors ${errorCount}. Hints ${hintCount}. Score ${score}, IQ ${iq}.`,
    );
    if (saveRecord) {
      // store record and show top list
      saveBestTime(currentDifficulty, elapsed, errorCount, hintCount);
    }
    const best = loadBestTimes(currentDifficulty);
    if (overText) {
      const top = best
        .slice(0, 5)
        .map(
          (r, i) =>
            `${i + 1}. ${fmtClock(r.ms)} (E${r.errors}, H${r.hints}, S${r.score ?? '-'}, IQ${r.iq ?? '-'})`,
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
      updateActionButtons();
    }
  }
  // restore last selection and wire segmented control
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setDiffUI(saved);
  } catch {}
  // Difficulty change requires confirmation; revert UI on cancel
  if (diffGroup) {
    diffGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-diff]');
      if (!btn) return;

      const next = btn.dataset.diff;
      const prev = currentDifficulty; // single shared declaration exists above

      // No-op if same difficulty
      if (!next || next === prev) {
        setDiffUI(prev);
        return;
      }

      // Optimistically reflect the clicked difficulty for immediate feedback
      setDiffUI(next);

      // One-shot revert on "No"
      const onNo = () => setDiffUI(prev);
      if (typeof confirmNo !== 'undefined' && confirmNo && confirmNo.addEventListener) {
        confirmNo.addEventListener('click', onNo, { once: true });
      }

      // Open confirm (this stops clock + disables inputs via openConfirm)
      openConfirm(`Switch to ${next} and start a new game?`, async () => {
        // Commit difficulty and start a fresh puzzle of that level
        await loadNewByDifficulty(next); // this updates currentDifficulty internally
      });
    });
  }
  // notes removed

  // remove legacy clear button if present

  let genAbort = null;
  const overlay = document.getElementById('gen-overlay');
  const btnCancel = document.getElementById('gen-cancel');

  function showOverlay(show) {
    overlay.classList.toggle('hidden', !show);
    overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
    syncInputEnabled();
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

  const btnNew = document.getElementById('new-puzzle');
  if (btnNew) {
    btnNew.addEventListener('click', async () => {
      const difficulty = getDiffUI();

      if (isUserCompleted) {
        // User already finished this puzzle: go straight to a new one (no confirm)
        await loadNewByDifficulty(difficulty);
        return;
      }

      // Otherwise, still guard with confirm
      openConfirm('Start a new puzzle? Your current progress will be lost.', async () => {
        await loadNewByDifficulty(difficulty);
      });
    });
  }

  document.getElementById('hint').addEventListener('click', () => {
    if (!solutionGrid) return;
    if (isSystemSolved) return; // ignore hints after Solve
    const maxHints = HINT_LIMIT[currentDifficulty] || 3;
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
          }),
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
              }),
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
    if (!solutionGrid) {
      api.setStatus('No puzzle loaded.');
      return;
    }
    // Fill the board and lock everything, but DO NOT record time/score/IQ or show overlay
    setBoard(api, solutionGrid);
    // lock all cells
    for (let i = 0; i < 81; i++) {
      const cell = api.boardEl.children[i];
      const input = cell.querySelector('input');
      input.readOnly = true;
      cell.classList.remove('mistake');
      cell.classList.add('prefill');
    }
    stopClock();
    // After auto-solve: lock down hint/pause and freeze time
    isSystemSolved = true;
    const btnHint = document.getElementById('hint');
    const btnPause = document.getElementById('pause');
    const btnSolve = document.getElementById('solve-board');
    const btnUndo = document.getElementById('undo');
    if (btnHint) btnHint.setAttribute('disabled', 'true');
    if (btnPause) btnPause.setAttribute('disabled', 'true');
    if (btnSolve) btnSolve.setAttribute('disabled', 'true');
    if (btnUndo) btnUndo.setAttribute('disabled', 'true');
    api.setStatus('Solved (auto).');
  });

  // Undo/Restart handlers (Redo removed)
  if (btnUndo)
    btnUndo.addEventListener('click', () => {
      if (history.length <= 1) return;

      // step back to previous snapshot
      history.pop();
      applySnapshot(history[history.length - 1]);

      // re-apply strict state
      if (solutionGrid && api.setSolution) api.setSolution(solutionGrid);

      // force UI to recompute pad + highlights (clears stale same-number highlights)
      api.boardEl.dispatchEvent(new CustomEvent('cell-change', { bubbles: true }));

      api.setStatus('Undid last move');
      updateActionButtons();
    });

  if (btnRestart) {
    btnRestart.addEventListener('click', () => {
      if (!originalPuzzle) return;

      // If the user legitimately solved the puzzle and the solved overlay is visible,
      // restart immediately WITHOUT asking.
      if (isUserCompleted && isSolvedOverlayVisible()) {
        setNewPuzzle(originalPuzzle, prefillMask, solutionGrid);
        api.setStatus('Puzzle restarted');
        return;
      }

      // Otherwise, keep the confirmation flow.
      openConfirm('Restart this puzzle from scratch?', () => {
        setNewPuzzle(originalPuzzle, prefillMask, solutionGrid);
        api.setStatus('Puzzle restarted');
      });
    });
  }

  // Snapshot on user edit
  api.boardEl.addEventListener('cell-change', () => {
    // Re-evaluate board to keep strict mistake highlights in sync
    if (solutionGrid) api.setSolution(solutionGrid);
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
        `Still wrong: ${digit} at R${r}C${c} — Errors: ${errorCount}/${ERROR_LIMIT[currentDifficulty]}`,
      );
      return;
    }
    if (digit !== null) lastWrong.set(idx, digit);
    errorCount++;
    const max = ERROR_LIMIT[currentDifficulty] || 3;
    if (errorCount >= max) {
      api.setStatus(`Game over — errors: ${errorCount}/${max}`);
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
