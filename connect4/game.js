'use strict';

/* =========================================================================
   CONNECT FOUR — alpha-beta minimax AI
   Board: 7 columns x 6 rows. board[col] is an array, index 0 = bottom.
   ========================================================================= */

const COLS = 7;
const ROWS = 6;
const HUMAN = 'R';
const AI = 'Y';
const AI_DEPTH = 6;

function newGame() {
  return {
    board: Array.from({ length: COLS }, () => []),
    turn: HUMAN,
    winner: null,       // 'R' | 'Y' | 'draw' | null
    winCells: null,      // [[col,row], ...]
    scores: { R: 0, Y: 0, draw: 0 },
    lastMove: null,
  };
}

function validCols(board) {
  const cols = [];
  for (let c = 0; c < COLS; c++) if (board[c].length < ROWS) cols.push(c);
  return cols;
}

function dropPiece(board, col, piece) {
  const row = board[col].length;
  board[col].push(piece);
  return row;
}

function undoPiece(board, col) {
  board[col].pop();
}

function cellAt(board, col, row) {
  if (col < 0 || col >= COLS) return null;
  return board[col][row] || null;
}

const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function checkWinAt(board, col, row) {
  const piece = cellAt(board, col, row);
  if (!piece) return null;
  for (const [dc, dr] of DIRECTIONS) {
    const cells = [[col, row]];
    for (let sign of [1, -1]) {
      let c = col + dc * sign, r = row + dr * sign;
      while (cellAt(board, c, r) === piece) {
        cells.push([c, r]);
        c += dc * sign; r += dr * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

function boardFull(board) {
  return board.every(col => col.length === ROWS);
}

function play(game, col) {
  if (game.winner || game.turn !== HUMAN) return false;
  if (game.board[col].length >= ROWS) return false;
  const row = dropPiece(game.board, col, HUMAN);
  game.lastMove = [col, row];
  const win = checkWinAt(game.board, col, row);
  if (win) { finish(game, HUMAN, win); return true; }
  if (boardFull(game.board)) { finish(game, 'draw', null); return true; }
  game.turn = AI;
  return true;
}

function aiMove(game) {
  if (game.winner || game.turn !== AI) return;
  const col = bestMove(game.board);
  const row = dropPiece(game.board, col, AI);
  game.lastMove = [col, row];
  const win = checkWinAt(game.board, col, row);
  if (win) { finish(game, AI, win); return; }
  if (boardFull(game.board)) { finish(game, 'draw', null); return; }
  game.turn = HUMAN;
}

function finish(game, winner, cells) {
  game.winner = winner;
  game.winCells = cells;
  game.scores[winner] = (game.scores[winner] || 0) + 1;
}

function newRound(game) {
  game.board = Array.from({ length: COLS }, () => []);
  game.turn = HUMAN;
  game.winner = null;
  game.winCells = null;
  game.lastMove = null;
}

/* ----------------------------------- AI ------------------------------------ */

function windowScore(cells, piece) {
  const opp = piece === AI ? HUMAN : AI;
  const countPiece = cells.filter(c => c === piece).length;
  const countOpp = cells.filter(c => c === opp).length;
  const countEmpty = cells.filter(c => c === null).length;
  if (countPiece === 4) return 100000;
  if (countOpp === 4) return -100000;
  if (countOpp === 0) {
    if (countPiece === 3 && countEmpty === 1) return 50;
    if (countPiece === 2 && countEmpty === 2) return 8;
  }
  if (countPiece === 0) {
    if (countOpp === 3 && countEmpty === 1) return -60;
    if (countOpp === 2 && countEmpty === 2) return -8;
  }
  return 0;
}

function evaluateBoard(board, piece) {
  let score = 0;
  // center column preference
  const centerCol = board[Math.floor(COLS / 2)];
  score += centerCol.filter(c => c === piece).length * 3;

  const get = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS) ? (board[c][r] || null) : undefined;

  // horizontal
  for (let r = 0; r < ROWS; r++) for (let c = 0; c <= COLS - 4; c++) {
    const w = [get(c, r), get(c + 1, r), get(c + 2, r), get(c + 3, r)];
    score += windowScore(w, piece);
  }
  // vertical
  for (let c = 0; c < COLS; c++) for (let r = 0; r <= ROWS - 4; r++) {
    const w = [get(c, r), get(c, r + 1), get(c, r + 2), get(c, r + 3)];
    score += windowScore(w, piece);
  }
  // diagonal up-right
  for (let c = 0; c <= COLS - 4; c++) for (let r = 0; r <= ROWS - 4; r++) {
    const w = [get(c, r), get(c + 1, r + 1), get(c + 2, r + 2), get(c + 3, r + 3)];
    score += windowScore(w, piece);
  }
  // diagonal down-right
  for (let c = 0; c <= COLS - 4; c++) for (let r = 3; r < ROWS; r++) {
    const w = [get(c, r), get(c + 1, r - 1), get(c + 2, r - 2), get(c + 3, r - 3)];
    score += windowScore(w, piece);
  }
  return score;
}

function orderedCols(board) {
  const center = Math.floor(COLS / 2);
  return validCols(board).sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
}

function minimax(board, depth, alpha, beta, maximizing) {
  const cols = validCols(board);
  if (depth === 0 || cols.length === 0) {
    return { score: evaluateBoard(board, AI) };
  }

  const piece = maximizing ? AI : HUMAN;
  let best = maximizing ? -Infinity : Infinity;
  let bestCol = cols[0];

  for (const col of orderedCols(board)) {
    const row = dropPiece(board, col, piece);
    const win = checkWinAt(board, col, row);
    let score;
    if (win) {
      score = maximizing ? 100000 - (6 - depth) : -100000 + (6 - depth);
    } else if (boardFull(board)) {
      score = 0;
    } else {
      score = minimax(board, depth - 1, alpha, beta, !maximizing).score;
    }
    undoPiece(board, col);

    if (maximizing) {
      if (score > best) { best = score; bestCol = col; }
      alpha = Math.max(alpha, best);
    } else {
      if (score < best) { best = score; bestCol = col; }
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return { score: best, col: bestCol };
}

function bestMove(board) {
  // take an immediate win or block if available (cheap, exact)
  for (const col of validCols(board)) {
    const row = dropPiece(board, col, AI);
    const win = checkWinAt(board, col, row);
    undoPiece(board, col);
    if (win) return col;
  }
  for (const col of validCols(board)) {
    const row = dropPiece(board, col, HUMAN);
    const win = checkWinAt(board, col, row);
    undoPiece(board, col);
    if (win) return col;
  }
  const result = minimax(board, AI_DEPTH, -Infinity, Infinity, true);
  return result.col;
}
