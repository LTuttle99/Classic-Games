'use strict';

/* =========================================================================
   OTHELLO / REVERSI — alpha-beta minimax AI
   Board: 8x8, board[r][c] is null | 'B' | 'W'. Black (human) moves first.
   ========================================================================= */

const SIZE = 8;
const HUMAN = 'B';
const AI = 'W';
const AI_DEPTH = 5;
const DIRECTIONS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
function opponent(color) { return color === HUMAN ? AI : HUMAN; }

function newGame() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  board[3][3] = AI; board[3][4] = HUMAN;
  board[4][3] = HUMAN; board[4][4] = AI;
  return {
    board,
    turn: HUMAN,
    winner: null,        // 'B' | 'W' | 'draw' | null
    over: false,
    lastMove: null,
    log: [],
  };
}

function log(game, msg) {
  game.log.push(msg);
  if (game.log.length > 300) game.log.shift();
}

// Returns the list of opponent cells that would be flipped if `color` plays at (r,c),
// or an empty array if the move is illegal there.
function flipsFor(board, color, r, c) {
  if (board[r][c] !== null) return [];
  const opp = opponent(color);
  const allFlips = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line = [];
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc) && board[nr][nc] === opp) {
      line.push([nr, nc]);
      nr += dr; nc += dc;
    }
    if (line.length > 0 && inBounds(nr, nc) && board[nr][nc] === color) {
      allFlips.push(...line);
    }
  }
  return allFlips;
}

function legalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const flips = flipsFor(board, color, r, c);
      if (flips.length > 0) moves.push({ r, c, flips });
    }
  }
  return moves;
}

function applyMove(board, color, move) {
  board[move.r][move.c] = color;
  for (const [fr, fc] of move.flips) board[fr][fc] = color;
}

function discCounts(board) {
  let b = 0, w = 0;
  for (const row of board) for (const cell of row) { if (cell === HUMAN) b++; else if (cell === AI) w++; }
  return { B: b, W: w };
}

function playMove(game, r, c) {
  const moves = legalMoves(game.board, game.turn);
  const move = moves.find(m => m.r === r && m.c === c);
  if (!move) return false;
  applyMove(game.board, game.turn, move);
  game.lastMove = { r, c };
  log(game, `${game.turn === HUMAN ? 'You' : 'CPU'} plays ${'abcdefgh'[c]}${r + 1} (flips ${move.flips.length})`);
  advanceTurn(game);
  return true;
}

function advanceTurn(game) {
  const justMoved = game.turn;
  const next = opponent(justMoved);
  if (legalMoves(game.board, next).length > 0) {
    game.turn = next;
    return;
  }
  // next player has no legal move — they pass, back to whoever just moved,
  // unless THAT player also has no move now, in which case the game is over.
  if (legalMoves(game.board, justMoved).length > 0) {
    log(game, `${next === HUMAN ? 'You have' : 'CPU has'} no legal move — pass.`);
    game.turn = justMoved;
    return;
  }
  finishGame(game);
}

function finishGame(game) {
  game.over = true;
  const counts = discCounts(game.board);
  if (counts.B > counts.W) game.winner = HUMAN;
  else if (counts.W > counts.B) game.winner = AI;
  else game.winner = 'draw';
  log(game, `Game over — You ${counts.B}, CPU ${counts.W}.`);
}

/* ----------------------------------- AI ------------------------------------ */

const CORNER_SQUARES = [[0, 0], [0, 7], [7, 0], [7, 7]];
const X_SQUARES = { '0,0': [1, 1], '0,7': [1, 6], '7,0': [6, 1], '7,7': [6, 6] };

function evaluateBoard(board, color) {
  const opp = opponent(color);
  const counts = discCounts(board);
  const mine = color === HUMAN ? counts.B : counts.W;
  const theirs = color === HUMAN ? counts.W : counts.B;

  let score = (mine - theirs) * 1;

  for (const [r, c] of CORNER_SQUARES) {
    if (board[r][c] === color) score += 25;
    else if (board[r][c] === opp) score -= 25;
  }
  for (const key in X_SQUARES) {
    const [cr, cc] = key.split(',').map(Number);
    const [xr, xc] = X_SQUARES[key];
    if (board[cr][cc] !== null) continue; // corner taken, X-square is now safe
    if (board[xr][xc] === color) score -= 12;
    else if (board[xr][xc] === opp) score += 12;
  }

  const myMoves = legalMoves(board, color).length;
  const theirMoves = legalMoves(board, opp).length;
  score += (myMoves - theirMoves) * 2;

  return score;
}

function minimax(board, depth, alpha, beta, color, forColor, passStreak) {
  const moves = legalMoves(board, color);
  if (moves.length === 0) {
    if (passStreak >= 1) {
      const counts = discCounts(board);
      const mine = forColor === HUMAN ? counts.B : counts.W;
      const theirs = forColor === HUMAN ? counts.W : counts.B;
      return { score: (mine > theirs ? 1 : mine < theirs ? -1 : 0) * 10000 };
    }
    return minimax(board, depth, alpha, beta, opponent(color), forColor, passStreak + 1);
  }
  if (depth === 0) return { score: evaluateBoard(board, forColor) };

  const maximizing = color === forColor;
  let best = maximizing ? -Infinity : Infinity;
  let bestMove = moves[0];

  for (const move of moves) {
    const b2 = board.map(row => row.slice());
    applyMove(b2, color, move);
    const result = minimax(b2, depth - 1, alpha, beta, opponent(color), forColor, 0);
    const score = result.score;
    if (maximizing) {
      if (score > best) { best = score; bestMove = move; }
      alpha = Math.max(alpha, best);
    } else {
      if (score < best) { best = score; bestMove = move; }
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return { score: best, move: bestMove };
}

function aiMove(game) {
  if (game.over || game.turn !== AI) return;
  const moves = legalMoves(game.board, AI);
  if (moves.length === 0) return;
  if (moves.length === 1) { applyMove(game.board, AI, moves[0]); finishAiMove(game, moves[0]); return; }
  const result = minimax(game.board, AI_DEPTH, -Infinity, Infinity, AI, AI, 0);
  const move = result.move || moves[0];
  applyMove(game.board, AI, move);
  finishAiMove(game, move);
}

function finishAiMove(game, move) {
  game.lastMove = { r: move.r, c: move.c };
  log(game, `CPU plays ${'abcdefgh'[move.c]}${move.r + 1} (flips ${move.flips.length})`);
  advanceTurn(game);
}
