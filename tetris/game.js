'use strict';

/* =========================================================================
   TETRIS — 7-bag randomizer, simple (non-SRS) rotation with basic wall kicks
   ========================================================================= */

const COLS = 10;
const ROWS = 20;
const BEST_KEY = 'tetris-best';

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const COLORS = { I: '#4dd9ec', O: '#f0d43a', T: '#b355e0', S: '#5fd15c', Z: '#e5453f', J: '#4d7dea', L: '#f0a13a' };
const TYPES = Object.keys(SHAPES);

function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGame() {
  const game = {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    bag: [],
    current: null,
    score: 0,
    best: loadBest(),
    lines: 0,
    level: 1,
    dropInterval: 800,
    over: false,
    softDrop: false,
  };
  refillBagIfNeeded(game);
  spawnNext(game);
  return game;
}

function refillBagIfNeeded(game) {
  if (game.bag.length <= 1) game.bag = game.bag.concat(shuffle(TYPES));
}

function spawnNext(game) {
  refillBagIfNeeded(game);
  const type = game.bag.shift();
  const matrix = SHAPES[type].map(row => row.slice());
  const col = Math.floor((COLS - matrix[0].length) / 2);
  game.current = { type, matrix, row: -1, col };
  game.nextType = game.bag[0];
  if (collides(game.board, matrix, game.current.row, game.current.col)) {
    game.over = true;
  }
}

function collides(board, matrix, row, col) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const br = row + r, bc = col + c;
      if (bc < 0 || bc >= COLS || br >= ROWS) return true;
      if (br >= 0 && board[br][bc]) return true;
    }
  }
  return false;
}

function rotateCW(matrix) {
  const n = matrix.length;
  const res = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) res[c][n - 1 - r] = matrix[r][c];
  return res;
}

function tryMove(game, dr, dc) {
  if (game.over || !game.current) return false;
  const p = game.current;
  const nr = p.row + dr, nc = p.col + dc;
  if (collides(game.board, p.matrix, nr, nc)) return false;
  p.row = nr; p.col = nc;
  return true;
}

function tryRotate(game) {
  if (game.over || !game.current) return false;
  const p = game.current;
  if (p.type === 'O') return true;
  const rotated = rotateCW(p.matrix);
  const kicks = [0, -1, 1, -2, 2];
  for (const dc of kicks) {
    if (!collides(game.board, rotated, p.row, p.col + dc)) {
      p.matrix = rotated;
      p.col += dc;
      return true;
    }
  }
  return false;
}

function hardDrop(game) {
  if (game.over || !game.current) return;
  let dist = 0;
  while (!collides(game.board, game.current.matrix, game.current.row + 1, game.current.col)) {
    game.current.row++;
    dist++;
  }
  game.score += dist * 2;
  lockPiece(game);
}

// Called on each gravity tick, or by a manual soft-drop step.
function step(game) {
  if (game.over || !game.current) return;
  if (tryMove(game, 1, 0)) {
    if (game.softDrop) game.score += 1;
    return;
  }
  lockPiece(game);
}

function lockPiece(game) {
  const p = game.current;
  let toppedOut = false;
  for (let r = 0; r < p.matrix.length; r++) {
    for (let c = 0; c < p.matrix[r].length; c++) {
      if (!p.matrix[r][c]) continue;
      const br = p.row + r, bc = p.col + c;
      if (br < 0) { toppedOut = true; continue; }
      game.board[br][bc] = p.type;
    }
  }
  const cleared = clearLines(game.board);
  if (cleared > 0) {
    const points = [0, 100, 300, 500, 800][cleared] * game.level;
    game.score += points;
    game.lines += cleared;
    if (game.score > game.best) { game.best = game.score; saveBest(game.best); }
    game.level = Math.floor(game.lines / 10) + 1;
    game.dropInterval = Math.max(120, 800 - (game.level - 1) * 60);
  }
  if (toppedOut) {
    game.over = true;
    game.current = null;
    return;
  }
  spawnNext(game);
}

function clearLines(board) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== null)) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      r++; // re-check this row index since rows shifted down
    }
  }
  return cleared;
}

function ghostRow(game) {
  if (!game.current) return null;
  const p = game.current;
  let r = p.row;
  while (!collides(game.board, p.matrix, r + 1, p.col)) r++;
  return r;
}
