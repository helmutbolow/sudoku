// Sudoku generator using a shuffled base pattern to create a valid board,
// then removing numbers to form a puzzle.

const N = 9;
const SUB = 3;

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
      return 54;
    case 'medium':
    default:
      return 48;
  }
}

export function generatePuzzle(difficulty = 'medium') {
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
    // remove symmetrically to keep aesthetics
    const r2 = N - 1 - r;
    const c2 = N - 1 - c;
    if (puzzle[r][c] !== 0) {
      puzzle[r][c] = 0;
      removed++;
    }
    if (removed < empties && puzzle[r2][c2] !== 0) {
      puzzle[r2][c2] = 0;
      removed++;
    }
  }

  const mask = puzzle.map((row) => row.map((v) => v !== 0));
  return { puzzle, mask, solution: full };
}
