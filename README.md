# Sudoku Web App (Vanilla JS)

A minimal, no-dependency Sudoku web app starter. Uses plain HTML/CSS/ES modules so you can open and hack immediately — great foundation to later migrate to React/Vite if you want.

## Run locally

Because browsers block ES modules from `file://` URLs, serve the folder with a simple local server (no installs required):

- Python 3: `python3 -m http.server 8000`
- Then open: http://localhost:8000/

You should see a Sudoku grid with buttons to load a sample, clear, and solve.

## Project structure

- `index.html` — entry point
- `styles.css` — basic layout and board styling
- `src/main.js` — wires up UI actions
- `src/ui.js` — renders the 9x9 grid and helpers
- `src/solver.js` — simple backtracking solver

## Next steps

- Convert to TypeScript or React: we can scaffold Vite + React/TS here and migrate these modules.
- Add validation and hint features.
- Persist puzzles in `localStorage`.
- Add generator to create new puzzles with varying difficulty.

## Git

If you want to initialize a repo here:

```
git init
git add .
git commit -m "chore: scaffold vanilla sudoku app"
```

(If your environment restricts git commands, let me know and I can run with approval.)

