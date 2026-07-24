'use strict';

/* =========================================================================
   2048 — sliding tile merge game
   Board is a 4x4 array of arrays, board[row][col]; null = empty.
   ========================================================================= */

const SIZE = 4;
const WIN_VALUE = 2048;
const BEST_KEY = '2048-best';

function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ }
}

function newGame() {
  const game = {
    board: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)),
    score: 0,
    best: loadBest(),
    won: false,
    keepPlaying: false,
    over: false,
    moved: false,
    spawnedCell: null,
  };
  spawnTile(game);
  spawnTile(game);
  return game;
}

function emptyCells(board) {
  const cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!board[r][c]) cells.push([r, c]);
  return cells;
}

function spawnTile(game) {
  const cells = emptyCells(game.board);
  if (cells.length === 0) return;
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  game.board[r][c] = Math.random() < 0.9 ? 2 : 4;
  game.spawnedCell = [r, c];
}

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function boardsEqual(a, b) {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (a[r][c] !== b[r][c]) return false;
  return true;
}

// Slides + merges one row (array of length SIZE, nulls allowed) to the left.
function slideRowLeft(row) {
  const compact = row.filter(v => v !== null);
  const result = [];
  let gained = 0;
  let i = 0;
  while (i < compact.length) {
    if (compact[i] !== undefined && compact[i] === compact[i + 1]) {
      const merged = compact[i] * 2;
      result.push(merged);
      gained += merged;
      i += 2;
    } else {
      result.push(compact[i]);
      i += 1;
    }
  }
  while (result.length < SIZE) result.push(null);
  return { row: result, gained };
}

function transpose(board) {
  const t = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) t[c][r] = board[r][c];
  return t;
}

function reverseRows(board) {
  return board.map(row => row.slice().reverse());
}

function applyMove(game, direction) {
  if (game.over || (game.won && !game.keepPlaying)) return false;
  let board = cloneBoard(game.board);
  let gained = 0;

  const processLeftwise = b => {
    const out = [];
    for (let r = 0; r < SIZE; r++) {
      const { row, gained: g } = slideRowLeft(b[r]);
      out.push(row);
      gained += g;
    }
    return out;
  };

  if (direction === 'left') {
    board = processLeftwise(board);
  } else if (direction === 'right') {
    board = reverseRows(processLeftwise(reverseRows(board)));
  } else if (direction === 'up') {
    board = transpose(processLeftwise(transpose(board)));
  } else if (direction === 'down') {
    board = transpose(reverseRows(processLeftwise(reverseRows(transpose(board)))));
  }

  const changed = !boardsEqual(board, game.board);
  if (!changed) return false;

  game.board = board;
  game.score += gained;
  if (game.score > game.best) { game.best = game.score; saveBest(game.best); }
  spawnTile(game);
  game.moved = true;

  if (!game.won && board.some(row => row.some(v => v === WIN_VALUE))) {
    game.won = true;
  }
  if (!hasMoves(game.board)) {
    game.over = true;
  }
  return true;
}

function hasMoves(board) {
  if (emptyCells(board).length > 0) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r][c];
      if (c < SIZE - 1 && board[r][c + 1] === v) return true;
      if (r < SIZE - 1 && board[r + 1][c] === v) return true;
    }
  }
  return false;
}

function continueGame(game) {
  game.keepPlaying = true;
}
