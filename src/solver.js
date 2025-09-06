// Simple backtracking solver. Returns solved board or null.

const EMPTY = 0;

function clone(board) {
  return board.map((row) => row.slice());
}

function isValid(board, r, c, val) {
  for (let i = 0; i < 9; i++) {
    if (board[r][i] === val) return false;
    if (board[i][c] === val) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[br + i][bc + j] === val) return false;
    }
  }
  return true;
}

function findEmpty(board) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === EMPTY) return [r, c];
    }
  }
  return null;
}

export function solve(board) {
  const grid = clone(board);

  function backtrack() {
    const pos = findEmpty(grid);
    if (!pos) return true;
    const [r, c] = pos;

    for (let val = 1; val <= 9; val++) {
      if (isValid(grid, r, c, val)) {
        grid[r][c] = val;
        if (backtrack()) return true;
        grid[r][c] = EMPTY;
      }
    }
    return false;
  }

  const ok = backtrack();
  return ok ? grid : null;
}
