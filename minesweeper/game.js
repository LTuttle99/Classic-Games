'use strict';

/* =========================================================================
   MINESWEEPER — first-click-safe, flood-fill reveal, chording
   ========================================================================= */

const DIFFICULTIES = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 24, mines: 99 },
};

function newGame(difficulty) {
  const { rows, cols, mines } = DIFFICULTIES[difficulty];
  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, adjacent: 0 }))
  );
  return {
    difficulty, rows, cols, mineCount: mines,
    grid,
    phase: 'ready',       // ready | playing | won | lost
    flagsUsed: 0,
    revealedCount: 0,
    startedAt: null,
    endedAt: null,
  };
}

function neighbors(game, r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < game.rows && nc >= 0 && nc < game.cols) out.push([nr, nc]);
    }
  }
  return out;
}

function placeMines(game, safeR, safeC) {
  const safe = new Set(neighbors(game, safeR, safeC).map(([r, c]) => `${r},${c}`));
  safe.add(`${safeR},${safeC}`);
  const cells = [];
  for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) {
    if (!safe.has(`${r},${c}`)) cells.push([r, c]);
  }
  // shuffle and take the first mineCount
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  for (let i = 0; i < game.mineCount && i < cells.length; i++) {
    const [r, c] = cells[i];
    game.grid[r][c].mine = true;
  }
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      if (game.grid[r][c].mine) continue;
      game.grid[r][c].adjacent = neighbors(game, r, c).filter(([nr, nc]) => game.grid[nr][nc].mine).length;
    }
  }
}

function reveal(game, r, c) {
  if (game.phase === 'won' || game.phase === 'lost') return;
  const cell = game.grid[r][c];
  if (cell.revealed || cell.flagged) return;

  if (game.phase === 'ready') {
    placeMines(game, r, c);
    game.phase = 'playing';
    game.startedAt = Date.now();
  }

  if (cell.mine) {
    cell.revealed = true;
    loseGame(game);
    return;
  }

  floodReveal(game, r, c);
  checkWin(game);
}

function floodReveal(game, r, c) {
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const cell = game.grid[cr][cc];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    game.revealedCount++;
    if (cell.adjacent === 0) {
      for (const [nr, nc] of neighbors(game, cr, cc)) {
        const n = game.grid[nr][nc];
        if (!n.revealed && !n.flagged && !n.mine) stack.push([nr, nc]);
      }
    }
  }
}

function toggleFlag(game, r, c) {
  if (game.phase === 'won' || game.phase === 'lost') return;
  const cell = game.grid[r][c];
  if (cell.revealed) return;
  if (game.phase === 'ready') return; // no flagging before the first reveal
  cell.flagged = !cell.flagged;
  game.flagsUsed += cell.flagged ? 1 : -1;
}

// Chording: clicking a revealed number whose adjacent flag count matches its
// number reveals all remaining unflagged neighbors (classic minesweeper QoL).
function chord(game, r, c) {
  if (game.phase !== 'playing') return;
  const cell = game.grid[r][c];
  if (!cell.revealed || cell.adjacent === 0) return;
  const nbrs = neighbors(game, r, c);
  const flagged = nbrs.filter(([nr, nc]) => game.grid[nr][nc].flagged).length;
  if (flagged !== cell.adjacent) return;
  for (const [nr, nc] of nbrs) {
    const n = game.grid[nr][nc];
    if (!n.flagged && !n.revealed) {
      if (n.mine) { n.revealed = true; loseGame(game); return; }
      floodReveal(game, nr, nc);
    }
  }
  checkWin(game);
}

function loseGame(game) {
  game.phase = 'lost';
  game.endedAt = Date.now();
  for (const row of game.grid) for (const cell of row) if (cell.mine) cell.revealed = true;
}

function checkWin(game) {
  const totalSafe = game.rows * game.cols - game.mineCount;
  if (game.revealedCount === totalSafe) {
    game.phase = 'won';
    game.endedAt = Date.now();
    for (const row of game.grid) for (const cell of row) if (cell.mine) cell.flagged = true;
    game.flagsUsed = game.mineCount;
  }
}
