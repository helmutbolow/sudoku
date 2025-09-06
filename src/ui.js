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
    validateCell(cell);
  });
  input.addEventListener('focus', () => cell.classList.add('focus'));
  input.addEventListener('blur', () => cell.classList.remove('focus'));

  cell.appendChild(input);
  return cell;
}

function validateCell(cell) {
  cell.classList.remove('invalid');
  const input = cell.querySelector('input');
  const val = input.value;
  if (val === '') return;
  const r = Number(cell.dataset.row);
  const c = Number(cell.dataset.col);
  const grid = cell.parentElement;
  // row/col duplicates
  const rowCells = [...grid.children].filter((el) => Number(el.dataset.row) === r);
  const colCells = [...grid.children].filter((el) => Number(el.dataset.col) === c);
  const dupInRow = rowCells.some((el) => el !== cell && el.querySelector('input').value === val);
  const dupInCol = colCells.some((el) => el !== cell && el.querySelector('input').value === val);
  if (dupInRow || dupInCol) cell.classList.add('invalid');
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

  const status = document.createElement('div');
  status.className = 'status';
  status.textContent = 'Ready';
  root.appendChild(status);

  return {
    root,
    boardEl,
    setStatus: (msg) => (status.textContent = msg),
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
        }
      }
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
