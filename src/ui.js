const EMPTY = 0;

function createCell(r, c) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.row = String(r);
  cell.dataset.col = String(c);

  const input = document.createElement('input');
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('maxlength', '1');
  input.setAttribute('aria-label', `Row ${r + 1} Col ${c + 1}`);
  input.addEventListener('input', (e) => {
    const v = input.value.replace(/\D/g, '');
    input.value = v.slice(0, 1);
    if (input.value) pulse(cell);
    recomputeValidity();
    cell.dispatchEvent(new CustomEvent('cell-change', { bubbles: true }));
  });
  input.addEventListener('focus', () => cell.classList.add('focus'));
  input.addEventListener('blur', () => cell.classList.remove('focus'));

  const notes = document.createElement('div');
  notes.className = 'notes';
  for (let i = 1; i <= 9; i++) {
    const s = document.createElement('span');
    s.dataset.n = String(i);
    notes.appendChild(s);
  }

  cell.appendChild(notes);
  cell.appendChild(input);
  return cell;
}

function validateCell(cell) {
  cell.classList.remove('invalid');
  const input = cell.querySelector('input');
  const val = input.value;
  if (val === '') return true;
  const r = Number(cell.dataset.row);
  const c = Number(cell.dataset.col);
  const grid = cell.parentElement;
  // row/col duplicates
  const rowCells = [...grid.children].filter((el) => Number(el.dataset.row) === r);
  const colCells = [...grid.children].filter((el) => Number(el.dataset.col) === c);
  const dupInRow = rowCells.some((el) => el !== cell && el.querySelector('input').value === val);
  const dupInCol = colCells.some((el) => el !== cell && el.querySelector('input').value === val);
  // 3x3 block duplicates
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  let dupInBlock = false;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const idx = (br + i) * 9 + (bc + j);
      const other = grid.children[idx];
      if (other !== cell && other.querySelector('input').value === val) dupInBlock = true;
    }
  }
  if (dupInRow || dupInCol || dupInBlock) {
    cell.classList.add('invalid');
    return false;
  }
  return true;
}

function computeCandidates(board, r, c) {
  if (board[r][c] !== EMPTY) return new Set();
  const cand = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (let i = 0; i < 9; i++) {
    cand.delete(board[r][i]);
    cand.delete(board[i][c]);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      cand.delete(board[br + i][bc + j]);
    }
  }
  return cand;
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
  let notesMode = false;
  let lockedIdx = null; // prevents leaving an invalid cell

  function getCellByIndex(idx) {
    return boardEl.children[idx];
  }

  function buildBoard() {
    const board = Array.from({ length: 9 }, () => Array(9).fill(EMPTY));
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const idx = r * 9 + c;
        const v = boardEl.children[idx].querySelector('input').value;
        board[r][c] = v ? Number(v) : EMPTY;
      }
    }
    return board;
  }

  function updatePad() {
    // Default: enable all
    buttons.forEach((b) => b.removeAttribute('disabled'));
    clearBtn.removeAttribute('disabled');
    if (selectedIdx == null) return;
    const cell = getCellByIndex(selectedIdx);
    const input = cell.querySelector('input');
    if (input.readOnly) {
      // Prefill: disable pad
      buttons.forEach((b) => b.setAttribute('disabled', ''));
      clearBtn.setAttribute('disabled', '');
      return;
    }
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);
    const board = buildBoard();
    const cand = computeCandidates(board, r, c);
    buttons.forEach((b) => {
      const n = Number(b.dataset.value);
      if (!cand.has(n)) b.setAttribute('disabled', '');
      else b.removeAttribute('disabled');
    });
  }

  function selectCell(idx) {
    if (lockedIdx != null && idx !== lockedIdx) {
      // Force selection to the locked invalid cell
      if (selectedIdx != null) getCellByIndex(selectedIdx).classList.remove('selected');
      selectedIdx = lockedIdx;
      const locked = getCellByIndex(lockedIdx);
      locked.classList.add('selected');
      locked.querySelector('input').focus();
      setStatus('Fix or clear the conflicting cell first.');
      updatePad();
      return;
    }
    if (selectedIdx != null) getCellByIndex(selectedIdx).classList.remove('selected');
    selectedIdx = idx;
    if (selectedIdx != null) getCellByIndex(selectedIdx).classList.add('selected');
    // Focus the input for typing support
    if (selectedIdx != null) {
      const inp = getCellByIndex(selectedIdx).querySelector('input');
      inp.focus();
    }
    updatePad();
  }

  // Click to select
  for (let idx = 0; idx < boardEl.children.length; idx++) {
    const cell = boardEl.children[idx];
    cell.addEventListener('click', () => selectCell(idx));
  }

  // Update pad when any cell changes
  boardEl.addEventListener('cell-change', updatePad);

  // Handle pad clicks
  pad.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (selectedIdx == null) return;
    const cell = getCellByIndex(selectedIdx);
    const input = cell.querySelector('input');
    if (input.readOnly) return;
    const val = btn.dataset.value || '';
    if (notesMode && input.value === '') {
      // toggle note
      toggleNote(cell, Number(btn.dataset.value));
    } else {
      input.value = val;
      updateHasValue(cell);
      pulse(cell);
      recomputeValidity();
      cell.dispatchEvent(new CustomEvent('cell-change', { bubbles: true }));
    }
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
      if (notesMode && input.value === '') {
        toggleNote(cell, Number(key));
      } else {
        input.value = key;
        updateHasValue(cell);
        pulse(cell);
        recomputeValidity();
        cell.dispatchEvent(new CustomEvent('cell-change', { bubbles: true }));
        // move right to next cell for faster entry
        moveSelection(0, 1);
      }
      e.preventDefault();
    } else if (key === 'Backspace' || key === 'Delete' || key === '0' || key === ' ') {
      if (notesMode && input.value === '') {
        clearNotes(cell);
      } else {
        input.value = '';
        updateHasValue(cell);
        recomputeValidity();
        cell.dispatchEvent(new CustomEvent('cell-change', { bubbles: true }));
      }
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
    } else if (key.toLowerCase() === 'n') {
      // quick toggle notes mode
      notesMode = !notesMode;
      root.dispatchEvent(new CustomEvent('notes-toggle', { detail: { on: notesMode } }));
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
    // Soft validation: highlight invalid cells, do not lock movement
    lockedIdx = null;
    for (let idx = 0; idx < 81; idx++) validateCell(boardEl.children[idx]);
    if (selectedIdx != null) {
      const ok = validateCell(getCellByIndex(selectedIdx));
      setStatus(ok ? 'Ready' : 'This entry conflicts. Fix or clear it.');
    }
  }

  function toggleNote(cell, n) {
    if (!n) return;
    const span = cell.querySelector(`.notes span[data-n="${n}"]`);
    if (!span) return;
    if (span.textContent) span.textContent = '';
    else span.textContent = String(n);
  }

  function clearNotes(cell) {
    cell.querySelectorAll('.notes span').forEach((s) => (s.textContent = ''));
  }

  function pulse(cell) {
    cell.classList.remove('value-pulse');
    // force reflow to restart animation
    void cell.offsetWidth;
    cell.classList.add('value-pulse');
  }

  return {
    root,
    boardEl,
    selectCell,
    setNotesMode(on) {
      notesMode = !!on;
    },
    hint() {
      // Try selected cell first
      const board = this.readBoard();
      const tryFill = (idx) => {
        const cell = boardEl.children[idx];
        const input = cell.querySelector('input');
        if (input.readOnly) return false;
        const r = Number(cell.dataset.row);
        const c = Number(cell.dataset.col);
        const cand = Array.from(computeCandidates(board, r, c));
        if (cand.length === 1) {
          input.value = String(cand[0]);
          updateHasValue(cell);
          pulse(cell);
          validateCell(cell);
          cell.dispatchEvent(new CustomEvent('cell-change', { bubbles: true }));
          this.setStatus(`Hint: filled ${cand[0]} at R${r + 1}C${c + 1}`);
          return true;
        } else if (cand.length > 1 && idx === selectedIdx) {
          this.setStatus(`R${r + 1}C${c + 1}: ${cand.length} candidates — ${cand.join(', ')}`);
          return false;
        }
        return false;
      };

      if (selectedIdx != null && tryFill(selectedIdx)) return;

      // Otherwise scan board for a single-candidate cell
      for (let idx = 0; idx < 81; idx++) {
        if (tryFill(idx)) {
          selectCell(idx);
          return;
        }
      }
      this.setStatus('No single-candidate cells found.');
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
          if (board[r][c])
            boardEl.children[idx]
              .querySelectorAll('.notes span')
              .forEach((s) => (s.textContent = ''));
        }
      }
      // Reset any previous lock based on new values
      recomputeValidity();
    },
    markPrefill(prefillMask) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const idx = r * 9 + c;
          const cell = boardEl.children[idx];
          cell.classList.toggle('prefill', !!prefillMask[r][c]);
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
