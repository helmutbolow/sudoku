// Sudoku generator using a shuffled base pattern to create a valid board,
// then removing numbers to form a puzzle.

const N = 9;
const SUB = 3;
const EMPTY = 0;

function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Base pattern to create a complete grid
function pattern(r, c) {
  return (SUB * (r % SUB) + Math.floor(r / SUB) + c) % N;
}

function generateComplete() {
  const rows = [].concat(
    ...shuffled([0, 1, 2]).map((g) => shuffled([0, 1, 2]).map((r) => g * SUB + r))
  );
  const cols = [].concat(
    ...shuffled([0, 1, 2]).map((g) => shuffled([0, 1, 2]).map((c) => g * SUB + c))
  );
  const nums = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const board = Array.from({ length: N }, () => Array(N).fill(0));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      board[r][c] = nums[pattern(rows[r], cols[c])];
    }
  }
  return board;
}

function holesForDifficulty(difficulty) {
  switch (difficulty) {
    case 'easy':
      return 27; // empties (easier: fewer blanks)
    case 'hard':
      return 54; // very challenging
    case 'medium':
    default:
      return 40;
  }
}

// Count solutions with early stop at `limit` (default 2).
function countSolutions(board, limit = 2) {
  // Find cell with minimum remaining values (MRV) to speed up.
  function findBestCell() {
    let bestR = -1,
      bestC = -1,
      bestOpts = null;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (board[r][c] !== EMPTY) continue;
        const opts = candidates(r, c);
        if (bestOpts === null || opts.length < bestOpts.length) {
          bestOpts = opts;
          bestR = r;
          bestC = c;
          if (opts.length <= 1) return { r: bestR, c: bestC, opts: bestOpts };
        }
      }
    }
    return bestR === -1 ? null : { r: bestR, c: bestC, opts: bestOpts };
  }

  function candidates(r, c) {
    const used = new Set();
    for (let i = 0; i < N; i++) {
      used.add(board[r][i]);
      used.add(board[i][c]);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) used.add(board[br + i][bc + j]);
    }
    const arr = [];
    for (let v = 1; v <= 9; v++) if (!used.has(v)) arr.push(v);
    return arr;
  }

  let solutions = 0;
  function backtrack() {
    if (solutions >= limit) return; // early stop
    const cell = findBestCell();
    if (!cell) {
      solutions++;
      return;
    }
    const { r, c, opts } = cell;
    if (opts.length === 0) return;
    for (const v of opts) {
      board[r][c] = v;
      backtrack();
      if (solutions >= limit) return;
      board[r][c] = EMPTY;
    }
  }

  backtrack();
  return solutions;
}

function hasUniqueSolution(puzzle) {
  const grid = puzzle.map((row) => row.slice());
  return countSolutions(grid, 2) === 1;
}

export function generatePuzzle(difficulty = 'medium') {
  // Try multiple times to guarantee uniqueness; bail out after a few attempts.
  const ATTEMPTS = 8;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const full = generateComplete();
    const empties = holesForDifficulty(difficulty);

    // Create an array of all cell positions and shuffle
    const cells = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cells.push([r, c]);
    const order = shuffled(cells);

    const puzzle = full.map((row) => row.slice());
    let removed = 0;
    for (const [r, c] of order) {
      if (removed >= empties) break;
      const r2 = N - 1 - r;
      const c2 = N - 1 - c;
      // Try removing a symmetric pair first
      const prev1 = puzzle[r][c];
      const prev2 = puzzle[r2][c2];
      if (prev1 !== EMPTY) puzzle[r][c] = EMPTY;
      if (prev2 !== EMPTY && (r2 !== r || c2 !== c)) puzzle[r2][c2] = EMPTY;
      if (hasUniqueSolution(puzzle)) {
        if (prev1 !== EMPTY) removed++;
        if (prev2 !== EMPTY && (r2 !== r || c2 !== c)) removed++;
      } else {
        // Revert and try single removal (random order)
        puzzle[r][c] = prev1;
        if (r2 !== r || c2 !== c) puzzle[r2][c2] = prev2;
        const singles =
          Math.random() < 0.5
            ? [
                { rr: r, cc: c, prev: prev1 },
                { rr: r2, cc: c2, prev: prev2 },
              ]
            : [
                { rr: r2, cc: c2, prev: prev2 },
                { rr: r, cc: c, prev: prev1 },
              ];
        for (const { rr, cc, prev } of singles) {
          if (removed >= empties) break;
          if (prev === EMPTY) continue;
          puzzle[rr][cc] = EMPTY;
          if (hasUniqueSolution(puzzle)) {
            removed++;
            break;
          } else {
            puzzle[rr][cc] = prev;
          }
        }
      }
    }

    // Final uniqueness assertion; if not unique, retry
    if (hasUniqueSolution(puzzle)) {
      const mask = puzzle.map((row) => row.map((v) => v !== 0));
      return { puzzle, mask, solution: full };
    }
  }
  // As a last resort, return a medium-strength unique puzzle
  return generatePuzzle('medium');
}
