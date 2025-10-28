const EMPTY = 0;

function createCell(r, c) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.row = r;
  cell.dataset.col = c;

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 1;

  // Prevent mobile keyboard:
  input.readOnly = true; // prevents native keyboard
  input.setAttribute('inputmode', 'none'); // extra hint for some browsers

  cell.appendChild(input);

  return cell;
}

export function initUI(root) {
  root.innerHTML = '';
  const boardEl = document.createElement('div');
  boardEl.className = 'board';

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      boardEl.appendChild(createCell(r, c));
    }
  }

  root.appendChild(boardEl);

  // Number picker panel
  const pad = document.createElement('div');
  pad.className = 'numpad';
  const buttons = [];
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(n);
    b.dataset.value = String(n);
    pad.appendChild(b);
    buttons.push(b);
  }
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear';
  clearBtn.className = 'muted';
  clearBtn.dataset.value = '';
  pad.appendChild(clearBtn);
  root.appendChild(pad);

  const status = document.createElement('div');
  status.className = 'status';
  status.textContent = 'Ready';
  root.appendChild(status);
  function setStatus(msg) {
    status.textContent = msg;
  }

  let selectedIdx = null;

  function getCellByIndex(idx) {
    return boardEl.children[idx];
  }

  function updatePad() {
    // enable everything by default
    buttons.forEach((b) => (b.disabled = false));
    clearBtn.disabled = false;

    if (selectedIdx == null) return;

    const cell = getCellByIndex(selectedIdx);
    const input = cell.querySelector('input');

    // If the selected cell is locked (given/correct), disable the pad
    if (input.readOnly) {
      buttons.forEach((b) => (b.disabled = true));
      clearBtn.disabled = true;
      return;
    }

    // Count digits currently on the board
    const counts = Array(10).fill(0);
    for (let idx = 0; idx < 81; idx++) {
      const v = boardEl.children[idx].querySelector('input').value;
      if (v) counts[Number(v)]++;
    }

    // Disable numbers that already appear 9 times
    buttons.forEach((b) => {
      const n = Number(b.dataset.value); // <-- correct attribute
      if (!Number.isFinite(n)) return;
      if (counts[n] >= 9) b.disabled = true;
    });
  }

  function selectCell(idx) {
    if (selectedIdx != null) getCellByIndex(selectedIdx).classList.remove('selected');
    selectedIdx = idx;
    if (selectedIdx != null) getCellByIndex(selectedIdx).classList.add('selected');
    // Focus the input for typing support
    if (selectedIdx != null) {
      const inp = getCellByIndex(selectedIdx).querySelector('input');
      inp.focus();
    }
    updatePad();
    // add row/col + same-number highlights
    updateHighlights();
  }

  // Pointer/tap to select without focusing the native input.
  // Prevent the default focus change so our custom keypad stays in control.
  for (let idx = 0; idx < boardEl.children.length; idx++) {
    const cell = boardEl.children[idx];
    cell.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      selectCell(idx);
    });
    cell.addEventListener('click', () => selectCell(idx));
  }

  // Update pad when any cell changes
  boardEl.addEventListener('cell-change', () => {
    updatePad();
    updateHighlights();
  });

  // Handle pad clicks
  pad.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (selectedIdx == null) return;
    const cell = getCellByIndex(selectedIdx);
    const input = cell.querySelector('input');
    if (input.readOnly) return;
    const val = btn.dataset.value || '';
    const r = Number(cell.dataset.row),
      c = Number(cell.dataset.col);
    const oldVal = input.value;
    if (val) {
      const digit = Number(val);
      if (!strictAccept(cell, digit)) {
        // keep wrong value in red, editable
        input.value = val;
        input.readOnly = false;
        cell.classList.add('mistake');
        updateHasValue(cell);
        flashError(cell);
        recomputeValidity();
        cell.dispatchEvent(
          new CustomEvent('strict-error', { bubbles: true, detail: { idx: r * 9 + c, digit } }),
        );
        cell.dispatchEvent(
          new CustomEvent('cell-change', {
            bubbles: true,
            detail: { idx: r * 9 + c, oldVal, newVal: val },
          }),
        );
        return;
      } else {
        input.value = val;
        input.readOnly = true;
        cell.classList.remove('mistake');
        cell.classList.add('prefill');
        updateHasValue(cell);
        pulse(cell);
        recomputeValidity();
        cell.dispatchEvent(
          new CustomEvent('cell-change', {
            bubbles: true,
            detail: { idx: r * 9 + c, oldVal, newVal: val },
          }),
        );
        return;
      }
    }
    input.value = '';
    updateHasValue(cell);
    recomputeValidity();
    cell.dispatchEvent(
      new CustomEvent('cell-change', {
        bubbles: true,
        detail: { idx: r * 9 + c, oldVal, newVal: '' },
      }),
    );
  });

  // Keyboard navigation and entry
  function moveSelection(dr, dc) {
    if (selectedIdx == null) {
      selectCell(0);
      return;
    }
    let r = Number(getCellByIndex(selectedIdx).dataset.row);
    let c = Number(getCellByIndex(selectedIdx).dataset.col);
    r = Math.min(8, Math.max(0, r + dr));
    c = Math.min(8, Math.max(0, c + dc));
    selectCell(r * 9 + c);
  }

  function handleKeydown(e) {
    const key = e.key;
    if (key.startsWith('Arrow')) {
      e.preventDefault();
      if (key === 'ArrowUp') moveSelection(-1, 0);
      else if (key === 'ArrowDown') moveSelection(1, 0);
      else if (key === 'ArrowLeft') moveSelection(0, -1);
      else if (key === 'ArrowRight') moveSelection(0, 1);
      return;
    }
    if (selectedIdx == null) return;
    const cell = getCellByIndex(selectedIdx);
    const input = cell.querySelector('input');
    if (input.readOnly) return;
    if (/^[1-9]$/.test(key)) {
      const digit = Number(key);
      const r = Number(cell.dataset.row),
        c = Number(cell.dataset.col);
      const oldVal = input.value;
      if (!strictAccept(cell, digit)) {
        // keep wrong digit visible (red), editable
        input.value = key;
        input.readOnly = false;
        cell.classList.add('mistake');
        updateHasValue(cell);
        flashError(cell);
        recomputeValidity();
        cell.dispatchEvent(
          new CustomEvent('strict-error', { bubbles: true, detail: { idx: r * 9 + c, digit } }),
        );
        cell.dispatchEvent(
          new CustomEvent('cell-change', {
            bubbles: true,
            detail: { idx: r * 9 + c, oldVal, newVal: key },
          }),
        );
      } else {
        input.value = key;
        input.readOnly = true;
        cell.classList.remove('mistake');
        cell.classList.add('prefill');
        updateHasValue(cell);
        pulse(cell);
        recomputeValidity();
        cell.dispatchEvent(
          new CustomEvent('cell-change', {
            bubbles: true,
            detail: { idx: r * 9 + c, oldVal, newVal: key },
          }),
        );
        // move right to next cell for faster entry
        moveSelection(0, 1);
      }
      e.preventDefault();
    } else if (key === 'Backspace' || key === 'Delete' || key === '0' || key === ' ') {
      const oldVal = input.value;
      input.value = '';
      updateHasValue(cell);
      recomputeValidity();
      const r = Number(cell.dataset.row),
        c = Number(cell.dataset.col);
      cell.dispatchEvent(
        new CustomEvent('cell-change', {
          bubbles: true,
          detail: { idx: r * 9 + c, oldVal, newVal: '' },
        }),
      );
      e.preventDefault();
    } else if (key === 'Home') {
      e.preventDefault();
      if (selectedIdx == null) selectCell(0);
      else selectCell(Math.floor(selectedIdx / 9) * 9 + 0);
    } else if (key === 'End') {
      e.preventDefault();
      if (selectedIdx == null) selectCell(8);
      else selectCell(Math.floor(selectedIdx / 9) * 9 + 8);
    } else if (key === 'PageUp') {
      e.preventDefault();
      moveSelection(-3, 0);
    } else if (key === 'PageDown') {
      e.preventDefault();
      moveSelection(3, 0);
    }
  }

  // Attach key handler when focus is within the app
  root.addEventListener('keydown', handleKeydown);
  root.tabIndex = 0;

  function updateHasValue(cell) {
    const has = cell.querySelector('input').value !== '';
    cell.classList.toggle('has-value', has);
  }

  function recomputeValidity() {
    // Strict-only normalization against solution (no row/col/box legality)
    for (let idx = 0; idx < 81; idx++) {
      const cell = boardEl.children[idx];
      const input = cell.querySelector('input');

      // No solution yet: keep everything locked and neutral
      if (!recomputeValidity.solution) {
        input.readOnly = true;
        cell.classList.remove('mistake');
        cell.classList.remove('prefill');
        continue;
      }

      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      const isGiven = cell.classList.contains('given');
      const sol = recomputeValidity.solution[r][c];

      if (isGiven) {
        input.readOnly = true;
        cell.classList.add('prefill');
        cell.classList.remove('mistake');
        continue;
      }

      const hasVal = input.value !== '';
      if (!hasVal) {
        input.readOnly = false;
        cell.classList.remove('mistake');
        cell.classList.remove('prefill');
        continue;
      }

      const v = Number(input.value);
      if (v === sol) {
        input.readOnly = true;
        cell.classList.add('prefill');
        cell.classList.remove('mistake');
      } else {
        input.readOnly = false;
        cell.classList.add('mistake');
        cell.classList.remove('prefill');
      }
    }

    // Status: binary in strict mode
    if (selectedIdx != null) {
      const sel = getCellByIndex(selectedIdx);
      const isMistake = sel.classList.contains('mistake');
      setStatus(isMistake ? 'Wrong number. Try again.' : 'Ready');
    }
  }
  // Highlights for row/column and same numbers
  function clearHighlights() {
    for (let i = 0; i < 81; i++) {
      const cell = boardEl.children[i];
      cell.classList.remove('hl-rc');
      cell.classList.remove('hl-same');
    }
  }
  function updateHighlights() {
    clearHighlights();
    if (selectedIdx == null) return;
    const sel = getCellByIndex(selectedIdx);
    const selRow = Number(sel.dataset.row);
    const selCol = Number(sel.dataset.col);
    const selVal = sel.querySelector('input').value;
    for (let i = 0; i < 81; i++) {
      const cell = boardEl.children[i];
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      if (r === selRow || c === selCol) cell.classList.add('hl-rc');
      const v = cell.querySelector('input').value;
      if (selVal && v && v === selVal) cell.classList.add('hl-same');
    }
  }

  // Strict mode helper: accept only digits matching the solution when provided
  function strictAccept(cell, digit) {
    if (typeof recomputeValidity.solution === 'undefined' || !recomputeValidity.solution)
      return true;
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);
    return recomputeValidity.solution[r][c] === digit;
  }

  // notes removed

  function pulse(cell) {
    cell.classList.remove('value-pulse');
    // force reflow to restart animation
    void cell.offsetWidth;
    cell.classList.add('value-pulse');
  }

  function flashError(cell) {
    cell.classList.remove('mistake-flash');
    const input = cell.querySelector('input');
    if (input) {
      // emphasize wrong digit (do not clear)
      input.classList.remove('wrong-pop');
      void input.offsetWidth;
      input.classList.add('wrong-pop');
    }
    void cell.offsetWidth;
    cell.classList.add('mistake-flash');
  }

  return {
    root,
    boardEl,
    selectCell,
    // expose for external hard resets on transitions
    clearHighlights,
    setSolution(sol) {
      recomputeValidity.solution = sol;
      recomputeValidity();
    },

    setEnabled(on) {
      for (let idx = 0; idx < 81; idx++) {
        const cell = boardEl.children[idx];
        const input = cell.querySelector('input');
        const isGiven = cell.classList.contains('given');
        const isLockedCorrect = cell.classList.contains('prefill') && input.value !== '';

        if (!on) {
          // Going disabled: remember editables we are locking due to overlay
          if (!isGiven && !isLockedCorrect && input.readOnly === false) {
            input.dataset.wasEditable = '1';
          }
          input.readOnly = true;
        } else {
          // Going enabled: restore only what we locked ourselves
          if (input.dataset.wasEditable === '1') {
            input.readOnly = false;
            delete input.dataset.wasEditable;
          }
        }
      }
      // Disable/enable numpad
      pad.querySelectorAll('button').forEach((b) => (b.disabled = !on));
      // Keep pad state consistent with current selection
      updatePad();
    },

    // Strict-only: UI no longer computes candidates. Hints are driven by main.js via solutionGrid.
    // Keep a safe stub so external callers won't crash.
    hint() {
      if (!recomputeValidity.solution) {
        this.setStatus('No puzzle loaded.');
        return;
      }
      this.setStatus('Hint handled by game logic.');
    },
    setStatus,
    readBoard() {
      const board = Array.from({ length: 9 }, () => Array(9).fill(EMPTY));
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const idx = r * 9 + c;
          const v = boardEl.children[idx].querySelector('input').value;
          board[r][c] = v ? Number(v) : EMPTY;
        }
      }
      return board;
    },
    writeBoard(board) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const idx = r * 9 + c;
          const input = boardEl.children[idx].querySelector('input');
          input.value = board[r][c] ? String(board[r][c]) : '';
          updateHasValue(boardEl.children[idx]);
          // nothing else
        }
      }
      // Reset any previous lock based on new values
      recomputeValidity();
      // Also reset selection and all highlights on any full board write
      if (typeof selectedIdx !== 'undefined' && selectedIdx != null) {
        getCellByIndex(selectedIdx)?.classList?.remove('selected');
      }
      selectedIdx = null;
      clearHighlights();
    },
    markPrefill(prefillMask) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const idx = r * 9 + c;
          const cell = boardEl.children[idx];
          const isGiven = !!prefillMask[r][c];
          cell.classList.toggle('prefill', isGiven);
          cell.classList.toggle('given', isGiven);
          cell.querySelector('input').readOnly = !!prefillMask[r][c];
        }
      }
    },
  };
}

export function clearBoard(api) {
  api.writeBoard(Array.from({ length: 9 }, () => Array(9).fill(EMPTY)));
  api.markPrefill(Array.from({ length: 9 }, () => Array(9).fill(false)));
  api.setStatus('Cleared');
}

export function setBoard(api, board) {
  api.writeBoard(board);
}

export function fillSample(api) {
  const puzzle = [
    [0, 0, 0, 2, 6, 0, 7, 0, 1],
    [6, 8, 0, 0, 7, 0, 0, 9, 0],
    [1, 9, 0, 0, 0, 4, 5, 0, 0],
    [8, 2, 0, 1, 0, 0, 0, 4, 0],
    [0, 0, 4, 6, 0, 2, 9, 0, 0],
    [0, 5, 0, 0, 0, 3, 0, 2, 8],
    [0, 0, 9, 3, 0, 0, 0, 7, 4],
    [0, 4, 0, 0, 5, 0, 0, 3, 6],
    [7, 0, 3, 0, 1, 8, 0, 0, 0],
  ];
  const mask = puzzle.map((row) => row.map((v) => v !== 0));
  api.writeBoard(puzzle);
  api.markPrefill(mask);
  api.setStatus('Sample puzzle loaded');
}
