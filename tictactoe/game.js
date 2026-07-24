'use strict';

/* =========================================================================
   TIC-TAC-TOE — perfect-play minimax AI
   ========================================================================= */

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function newGame() {
  return {
    board: Array(9).fill(null),
    turn: 'X',        // X = human, O = AI
    winner: null,      // 'X' | 'O' | 'draw' | null
    winLine: null,
    scores: { X: 0, O: 0, draw: 0 },
  };
}

function checkWinner(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every(c => c !== null)) return { winner: 'draw', line: null };
  return null;
}

function play(game, index) {
  if (game.winner || game.board[index] || game.turn !== 'X') return false;
  game.board[index] = 'X';
  const result = checkWinner(game.board);
  if (result) { finish(game, result); return true; }
  game.turn = 'O';
  return true;
}

function aiMove(game) {
  if (game.winner || game.turn !== 'O') return;
  const index = bestMove(game.board, 'O');
  game.board[index] = 'O';
  const result = checkWinner(game.board);
  if (result) { finish(game, result); return; }
  game.turn = 'X';
}

function finish(game, result) {
  game.winner = result.winner;
  game.winLine = result.line;
  game.scores[result.winner] = (game.scores[result.winner] || 0) + 1;
}

function newRound(game) {
  game.board = Array(9).fill(null);
  game.turn = 'X';
  game.winner = null;
  game.winLine = null;
}

/* ---------------------------------- AI --------------------------------- */

function bestMove(board, player) {
  const opponent = player === 'X' ? 'O' : 'X';
  let best = -Infinity;
  let choices = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = player;
    const score = minimax(board, opponent, player, 0, -Infinity, Infinity);
    board[i] = null;
    if (score > best) { best = score; choices = [i]; }
    else if (score === best) { choices.push(i); }
  }
  return choices[Math.floor(Math.random() * choices.length)];
}

function minimax(board, turn, maximizer, depth, alpha, beta) {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === 'draw') return 0;
    const score = 10 - depth;
    return result.winner === maximizer ? score : -score;
  }
  const opponent = turn === 'X' ? 'O' : 'X';
  if (turn === maximizer) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = turn;
      best = Math.max(best, minimax(board, opponent, maximizer, depth + 1, alpha, beta));
      board[i] = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = turn;
      best = Math.min(best, minimax(board, opponent, maximizer, depth + 1, alpha, beta));
      board[i] = null;
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}
