'use strict';

/* =========================================================================
   CHECKERS — standard American rules: mandatory capture, multi-jump chains,
   kings. Alpha-beta minimax AI.
   Board: 8x8 array, board[row][col] is null or {color:'R'|'B', king:bool}.
   Human = 'R' (starts rows 5-7, moves toward row 0).
   AI    = 'B' (starts rows 0-2, moves toward row 7).
   ========================================================================= */

const SIZE = 8;
const HUMAN = 'R';
const AI = 'B';
const AI_DEPTH = 6;

const UP2 = [[-1, -1], [-1, 1]];
const DOWN2 = [[1, -1], [1, 1]];
const ALL4 = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
function isPromotionRow(color, row) { return color === HUMAN ? row === 0 : row === SIZE - 1; }
function opponent(color) { return color === HUMAN ? AI : HUMAN; }

function newGame() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 !== 1) continue; // only dark squares are playable
      if (r < 3) board[r][c] = { color: AI, king: false };
      else if (r > 4) board[r][c] = { color: HUMAN, king: false };
    }
  }
  return {
    board,
    turn: HUMAN,
    winner: null,
    log: [],
    lastMove: null,
  };
}

function log(game, msg) {
  game.log.push(msg);
  if (game.log.length > 300) game.log.shift();
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => cell ? { color: cell.color, king: cell.king } : null));
}

/* --------------------------------- Move generation -------------------------------- */

// Recursively finds every maximal capture sequence starting from (r,c). Mutates `board`
// as scratch space and restores it before returning (safe to call on the live board).
function findJumpSequences(board, r, c, color, isKing) {
  const dirs = isKing ? ALL4 : (color === HUMAN ? UP2 : DOWN2);
  const results = [];
  for (const [dr, dc] of dirs) {
    const midR = r + dr, midC = c + dc, landR = r + 2 * dr, landC = c + 2 * dc;
    if (!inBounds(landR, landC)) continue;
    const midPiece = board[midR][midC];
    if (!midPiece || midPiece.color === color) continue;
    if (board[landR][landC]) continue;

    const savedMid = board[midR][midC];
    board[midR][midC] = null;
    board[r][c] = null;
    board[landR][landC] = { color, king: isKing };

    const promotes = !isKing && isPromotionRow(color, landR);
    const subSeqs = promotes ? [] : findJumpSequences(board, landR, landC, color, isKing);

    if (subSeqs.length === 0) {
      results.push({ to: { r: landR, c: landC }, captures: [{ r: midR, c: midC }], promoted: promotes });
    } else {
      for (const s of subSeqs) {
        results.push({ to: s.to, captures: [{ r: midR, c: midC }, ...s.captures], promoted: s.promoted });
      }
    }

    board[r][c] = { color, king: isKing };
    board[midR][midC] = savedMid;
    board[landR][landC] = null;
  }
  return results;
}

function generateMoves(board, color) {
  const jumps = [];
  const simples = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      const js = findJumpSequences(board, r, c, color, piece.king);
      for (const j of js) jumps.push({ from: { r, c }, ...j });
      if (js.length === 0) {
        const dirs = piece.king ? ALL4 : (color === HUMAN ? UP2 : DOWN2);
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc) && !board[nr][nc]) {
            simples.push({
              from: { r, c }, to: { r: nr, c: nc }, captures: [],
              promoted: !piece.king && isPromotionRow(color, nr),
            });
          }
        }
      }
    }
  }
  return jumps.length > 0 ? jumps : simples;
}

function applyMove(board, move) {
  const piece = board[move.from.r][move.from.c];
  board[move.from.r][move.from.c] = null;
  for (const cap of move.captures) board[cap.r][cap.c] = null;
  board[move.to.r][move.to.c] = { color: piece.color, king: piece.king || move.promoted };
}

function pieceCount(board, color) {
  let n = 0;
  for (const row of board) for (const cell of row) if (cell && cell.color === color) n++;
  return n;
}

/* ----------------------------------- Turn flow ------------------------------------ */

function legalMovesFor(game, r, c) {
  const all = generateMoves(game.board, game.turn);
  return all.filter(m => m.from.r === r && m.from.c === c);
}

function currentLegalMoves(game) {
  return generateMoves(game.board, game.turn);
}

function playMove(game, move) {
  applyMove(game.board, move);
  const capCount = move.captures.length;
  log(game, `${game.turn === HUMAN ? 'You' : 'CPU'} move${capCount ? ` (capturing ${capCount})` : ''}`);
  game.lastMove = move;

  const opp = opponent(game.turn);
  if (pieceCount(game.board, opp) === 0 || generateMoves(game.board, opp).length === 0) {
    game.winner = game.turn;
    log(game, `${game.turn === HUMAN ? 'You win!' : 'CPU wins.'}`);
    return;
  }
  game.turn = opp;
}

/* ----------------------------------- AI ------------------------------------ */

const POSITION_BONUS = (() => {
  // mild center/advancement bonus per square, symmetric
  const bonus = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const centerDist = Math.abs(r - 3.5) + Math.abs(c - 3.5);
    bonus[r][c] = (7 - centerDist) * 0.02;
  }
  return bonus;
})();

function evaluateBoard(board, color) {
  let score = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      let value = p.king ? 1.8 : 1;
      if (!p.king) {
        // reward advancement toward the king row
        const progress = p.color === HUMAN ? (SIZE - 1 - r) / (SIZE - 1) : r / (SIZE - 1);
        value += progress * 0.3;
      }
      value += POSITION_BONUS[r][c];
      score += p.color === color ? value : -value;
    }
  }
  return score;
}

function minimax(board, depth, alpha, beta, color, forColor) {
  const moves = generateMoves(board, color);
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      // no legal moves = loss for `color`
      const terminal = color === forColor ? -1000 + (6 - depth) : 1000 - (6 - depth);
      return { score: terminal };
    }
    return { score: evaluateBoard(board, forColor) };
  }

  const maximizing = color === forColor;
  let best = maximizing ? -Infinity : Infinity;
  let bestMove = moves[0];

  for (const move of moves) {
    const b2 = cloneBoard(board);
    applyMove(b2, move);
    const result = minimax(b2, depth - 1, alpha, beta, opponent(color), forColor);
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
  if (game.winner || game.turn !== AI) return;
  const moves = currentLegalMoves(game);
  if (moves.length === 1) { playMove(game, moves[0]); return; }
  const result = minimax(game.board, AI_DEPTH, -Infinity, Infinity, AI, AI);
  playMove(game, result.move || moves[0]);
}
