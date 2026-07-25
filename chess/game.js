'use strict';

/* =========================================================================
   CHESS — full rules (en passant, castling, promotion, check/mate/stalemate)
   plus an alpha-beta minimax AI with piece-square tables.
   Board: 8x8, board[r][c] is null or {type:'P'|'N'|'B'|'R'|'Q'|'K', color:'w'|'b'}.
   row0 = rank 8 (Black's back rank), row7 = rank 1 (White's back rank, human).
   ========================================================================= */

const HUMAN = 'w';
const AI = 'b';
const AI_DEPTH = 3;

const FILES = 'abcdefgh';
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const QUEEN_DIRS = BISHOP_DIRS.concat(ROOK_DIRS);
const KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function squareName(r, c) { return FILES[c] + (8 - r); }
function otherColor(color) { return color === 'w' ? 'b' : 'w'; }

function newGame() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: 'b' };
    board[1][c] = { type: 'P', color: 'b' };
    board[6][c] = { type: 'P', color: 'w' };
    board[7][c] = { type: backRank[c], color: 'w' };
  }
  const state = {
    board,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    status: 'playing',   // playing | check | checkmate | stalemate
    winner: null,         // 'w' | 'b' | 'draw' | null
    lastMove: null,
    log: [],
  };
  return state;
}

function log(state, msg) {
  state.log.push(msg);
  if (state.log.length > 400) state.log.shift();
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.type === 'K' && p.color === color) return { r, c };
  }
  return null;
}

function isSquareAttacked(board, r, c, byColor) {
  const pawnDr = byColor === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = r + pawnDr, pc = c + dc;
    if (inBounds(pr, pc)) { const p = board[pr][pc]; if (p && p.color === byColor && p.type === 'P') return true; }
  }
  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) { const p = board[nr][nc]; if (p && p.color === byColor && p.type === 'N') return true; }
  }
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) { const p = board[nr][nc]; if (p && p.color === byColor && p.type === 'K') return true; }
  }
  for (const [dr, dc] of BISHOP_DIRS) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) { if (p.color === byColor && (p.type === 'B' || p.type === 'Q')) return true; break; }
      nr += dr; nc += dc;
    }
  }
  for (const [dr, dc] of ROOK_DIRS) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) { if (p.color === byColor && (p.type === 'R' || p.type === 'Q')) return true; break; }
      nr += dr; nc += dc;
    }
  }
  return false;
}

/* ------------------------------ Move generation ------------------------------ */

function addPawnMove(moves, r, c, nr, nc, color, captured, promoRow) {
  if (nr === promoRow) {
    moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece: 'P', color, captured, enPassant: false, promotion: 'Q', castle: null });
  } else {
    moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece: 'P', color, captured, enPassant: false, promotion: null, castle: null });
  }
}

function pawnMoves(state, r, c, color, moves) {
  const board = state.board;
  const dir = color === 'w' ? -1 : 1;
  const startRow = color === 'w' ? 6 : 1;
  const promoRow = color === 'w' ? 0 : 7;
  const oneR = r + dir;
  if (inBounds(oneR, c) && !board[oneR][c]) {
    addPawnMove(moves, r, c, oneR, c, color, null, promoRow);
    const twoR = r + 2 * dir;
    if (r === startRow && !board[twoR][c]) {
      moves.push({ from: { r, c }, to: { r: twoR, c }, piece: 'P', color, captured: null, enPassant: false, promotion: null, castle: null });
    }
  }
  for (const dc of [-1, 1]) {
    const nr = r + dir, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const target = board[nr][nc];
    if (target && target.color !== color) {
      addPawnMove(moves, r, c, nr, nc, color, target, promoRow);
    } else if (!target && state.enPassant && state.enPassant.r === nr && state.enPassant.c === nc) {
      moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece: 'P', color, captured: { type: 'P', color: otherColor(color) }, enPassant: true, promotion: null, castle: null });
    }
  }
}

function knightMoves(state, r, c, color, moves) {
  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const target = state.board[nr][nc];
    if (!target || target.color !== color) {
      moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece: 'N', color, captured: target, enPassant: false, promotion: null, castle: null });
    }
  }
}

function slideMoves(state, r, c, color, directions, pieceType, moves) {
  const board = state.board;
  for (const [dr, dc] of directions) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const target = board[nr][nc];
      if (!target) {
        moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece: pieceType, color, captured: null, enPassant: false, promotion: null, castle: null });
      } else {
        if (target.color !== color) moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece: pieceType, color, captured: target, enPassant: false, promotion: null, castle: null });
        break;
      }
      nr += dr; nc += dc;
    }
  }
}

function kingMoves(state, r, c, color, moves) {
  const board = state.board;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const target = board[nr][nc];
    if (!target || target.color !== color) {
      moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece: 'K', color, captured: target, enPassant: false, promotion: null, castle: null });
    }
  }
  const rights = state.castling;
  const backRank = color === 'w' ? 7 : 0;
  if (r === backRank && c === 4) {
    const opp = otherColor(color);
    if (!isSquareAttacked(board, r, c, opp)) {
      if ((color === 'w' ? rights.wK : rights.bK) && !board[backRank][5] && !board[backRank][6] &&
          !isSquareAttacked(board, backRank, 5, opp) && !isSquareAttacked(board, backRank, 6, opp)) {
        moves.push({ from: { r, c }, to: { r: backRank, c: 6 }, piece: 'K', color, captured: null, enPassant: false, promotion: null, castle: 'K' });
      }
      if ((color === 'w' ? rights.wQ : rights.bQ) && !board[backRank][1] && !board[backRank][2] && !board[backRank][3] &&
          !isSquareAttacked(board, backRank, 3, opp) && !isSquareAttacked(board, backRank, 2, opp)) {
        moves.push({ from: { r, c }, to: { r: backRank, c: 2 }, piece: 'K', color, captured: null, enPassant: false, promotion: null, castle: 'Q' });
      }
    }
  }
}

function generatePseudoMoves(state, color) {
  const moves = [];
  const board = state.board;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      switch (p.type) {
        case 'P': pawnMoves(state, r, c, color, moves); break;
        case 'N': knightMoves(state, r, c, color, moves); break;
        case 'B': slideMoves(state, r, c, color, BISHOP_DIRS, 'B', moves); break;
        case 'R': slideMoves(state, r, c, color, ROOK_DIRS, 'R', moves); break;
        case 'Q': slideMoves(state, r, c, color, QUEEN_DIRS, 'Q', moves); break;
        case 'K': kingMoves(state, r, c, color, moves); break;
      }
    }
  }
  return moves;
}

function cloneState(state) {
  return {
    board: state.board.map(row => row.map(cell => (cell ? { type: cell.type, color: cell.color } : null))),
    castling: { ...state.castling },
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    turn: state.turn,
  };
}

function applyMoveLite(state, move) {
  const board = state.board;
  const piece = board[move.from.r][move.from.c];
  board[move.from.r][move.from.c] = null;
  if (move.enPassant) board[move.from.r][move.to.c] = null;
  board[move.to.r][move.to.c] = move.promotion ? { type: move.promotion, color: piece.color } : piece;
  if (move.castle) {
    const backRank = move.from.r;
    if (move.castle === 'K') { board[backRank][5] = board[backRank][7]; board[backRank][7] = null; }
    else { board[backRank][3] = board[backRank][0]; board[backRank][0] = null; }
  }
  if (piece.type === 'K') {
    if (piece.color === 'w') { state.castling.wK = false; state.castling.wQ = false; }
    else { state.castling.bK = false; state.castling.bQ = false; }
  }
  const clearRookRight = (r, c) => {
    if (r === 0 && c === 0) state.castling.bQ = false;
    if (r === 0 && c === 7) state.castling.bK = false;
    if (r === 7 && c === 0) state.castling.wQ = false;
    if (r === 7 && c === 7) state.castling.wK = false;
  };
  clearRookRight(move.from.r, move.from.c);
  if (move.captured) clearRookRight(move.to.r, move.to.c);
  state.enPassant = (piece.type === 'P' && Math.abs(move.to.r - move.from.r) === 2)
    ? { r: (move.from.r + move.to.r) / 2, c: move.from.c } : null;
  state.turn = otherColor(piece.color);
}

function cloneStateAndApply(state, move) {
  const s2 = cloneState(state);
  applyMoveLite(s2, move);
  return s2;
}

function legalMoves(state, color) {
  const pseudo = generatePseudoMoves(state, color);
  return pseudo.filter(m => {
    const s2 = cloneStateAndApply(state, m);
    const kingPos = findKing(s2.board, color);
    if (!kingPos) return false;
    return !isSquareAttacked(s2.board, kingPos.r, kingPos.c, otherColor(color));
  });
}

function formatMove(move) {
  if (move.castle === 'K') return 'O-O';
  if (move.castle === 'Q') return 'O-O-O';
  const pieceLetter = move.piece === 'P' ? '' : move.piece;
  const capture = (move.captured || move.enPassant) ? 'x' : '';
  const fromFile = move.piece === 'P' && capture ? FILES[move.from.c] : '';
  let s = `${pieceLetter}${fromFile}${capture}${squareName(move.to.r, move.to.c)}`;
  if (move.promotion) s += `=${move.promotion}`;
  return s;
}

function applyMove(state, move) {
  applyMoveLite(state, move);
  state.lastMove = move;
  log(state, `${move.color === 'w' ? 'White' : 'Black'} ${formatMove(move)}`);
  updateGameStatus(state);
}

function updateGameStatus(state) {
  const moves = legalMoves(state, state.turn);
  const kingPos = findKing(state.board, state.turn);
  const inCheck = kingPos ? isSquareAttacked(state.board, kingPos.r, kingPos.c, otherColor(state.turn)) : false;
  if (moves.length === 0) {
    if (inCheck) {
      state.status = 'checkmate';
      state.winner = otherColor(state.turn);
      log(state, `Checkmate — ${state.winner === 'w' ? 'White' : 'Black'} wins.`);
    } else {
      state.status = 'stalemate';
      state.winner = 'draw';
      log(state, 'Stalemate — draw.');
    }
  } else {
    state.status = inCheck ? 'check' : 'playing';
    if (inCheck) log(state, 'Check!');
  }
}

/* ----------------------------------- AI ------------------------------------ */

const PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];
const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];
const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];
const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];
const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];
const KING_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];
const PST = { P: PAWN_PST, N: KNIGHT_PST, B: BISHOP_PST, R: ROOK_PST, Q: QUEEN_PST, K: KING_PST };

function pstValue(type, color, r, c) {
  const idx = color === 'w' ? r : 7 - r;
  return PST[type][idx][c];
}

function evaluateBoard(state, color) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      const val = PIECE_VALUE[p.type] + pstValue(p.type, p.color, r, c);
      score += p.color === color ? val : -val;
    }
  }
  return score;
}

function orderMoves(moves) {
  return moves.slice().sort((a, b) => {
    const av = a.captured ? PIECE_VALUE[a.captured.type] : 0;
    const bv = b.captured ? PIECE_VALUE[b.captured.type] : 0;
    return bv - av;
  });
}

function minimax(state, depth, alpha, beta, color, forColor) {
  const moves = orderMoves(legalMoves(state, color));
  if (moves.length === 0) {
    const kingPos = findKing(state.board, color);
    const inCheck = kingPos ? isSquareAttacked(state.board, kingPos.r, kingPos.c, otherColor(color)) : false;
    if (inCheck) return { score: color === forColor ? -100000 - depth : 100000 + depth };
    return { score: 0 };
  }
  if (depth === 0) return { score: evaluateBoard(state, forColor) };

  const maximizing = color === forColor;
  let best = maximizing ? -Infinity : Infinity;
  let bestMove = moves[0];
  for (const move of moves) {
    const nextState = cloneStateAndApply(state, move);
    const result = minimax(nextState, depth - 1, alpha, beta, otherColor(color), forColor);
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

function aiMove(state) {
  if (state.status === 'checkmate' || state.status === 'stalemate' || state.turn !== AI) return;
  const result = minimax(state, AI_DEPTH, -Infinity, Infinity, AI, AI);
  if (result.move) applyMove(state, result.move);
}
