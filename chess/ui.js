'use strict';

const AI_DELAY = 500;
const GLYPH = { P: '♟', N: '♞', B: '♝', R: '♜', Q: '♛', K: '♚' };

let state = newGame();
let selected = null;     // {r,c} | null
let legalDests = [];       // legal moves from `selected`
let pendingPromotion = null; // move object awaiting a promotion choice

const $ = sel => document.querySelector(sel);

function key(r, c) { return `${r},${c}`; }

function selectSquare(r, c) {
  if (state.status === 'checkmate' || state.status === 'stalemate' || state.turn !== HUMAN) return;
  if (selected && selected.r === r && selected.c === c) { selected = null; legalDests = []; render(); return; }
  const piece = state.board[r][c];
  if (!piece || piece.color !== HUMAN) return;
  const moves = legalMoves(state, HUMAN).filter(m => m.from.r === r && m.from.c === c);
  if (moves.length === 0) return;
  selected = { r, c };
  legalDests = moves;
  render();
}

function tryMoveTo(r, c) {
  const move = legalDests.find(m => m.to.r === r && m.to.c === c);
  if (!move) return;
  if (move.promotion) {
    pendingPromotion = move;
    render();
    return;
  }
  commitMove(move);
}

function commitMove(move) {
  applyMove(state, move);
  selected = null;
  legalDests = [];
  pendingPromotion = null;
  render();
  if (state.status !== 'checkmate' && state.status !== 'stalemate' && state.turn === AI) {
    setTimeout(() => { aiMove(state); render(); }, AI_DELAY);
  }
}

function choosePromotion(type) {
  if (!pendingPromotion) return;
  commitMove({ ...pendingPromotion, promotion: type });
}

function capturedPieces(color) {
  // pieces of `color` currently missing from the board = captured
  const startCounts = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
  const onBoard = { P: 0, N: 0, B: 0, R: 0, Q: 0 };
  for (const row of state.board) for (const cell of row) {
    if (cell && cell.color === color && onBoard[cell.type] !== undefined) onBoard[cell.type]++;
  }
  const missing = [];
  for (const type of ['Q', 'R', 'B', 'N', 'P']) {
    const n = startCounts[type] - onBoard[type];
    for (let i = 0; i < n; i++) missing.push(GLYPH[type]);
  }
  return missing.join(' ') || '—';
}

function render() {
  $('#cap-white').textContent = capturedPieces('w');
  $('#cap-black').textContent = capturedPieces('b');

  const destKeys = new Set(legalDests.map(m => key(m.to.r, m.to.c)));
  const kingPos = findKing(state.board, state.turn);
  const inCheck = state.status === 'check' || state.status === 'checkmate';

  const boardEl = $('#board');
  boardEl.innerHTML = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      const light = (r + c) % 2 === 0;
      sq.className = 'square ' + (light ? 'light' : 'dark');
      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');
      if (state.lastMove && state.lastMove.from.r === r && state.lastMove.from.c === c) sq.classList.add('last-from');
      if (state.lastMove && state.lastMove.to.r === r && state.lastMove.to.c === c) sq.classList.add('last-to');
      if (inCheck && kingPos && kingPos.r === r && kingPos.c === c) sq.classList.add('in-check');

      const piece = state.board[r][c];
      if (piece) {
        const glyph = document.createElement('span');
        glyph.className = `piece-glyph ${piece.color}`;
        glyph.textContent = GLYPH[piece.type];
        sq.appendChild(glyph);
      }
      if (destKeys.has(key(r, c))) {
        sq.classList.add('dest');
        if (piece) sq.classList.add('has-piece');
        sq.addEventListener('click', () => tryMoveTo(r, c));
      } else if (piece && piece.color === HUMAN && state.turn === HUMAN) {
        sq.classList.add('selectable');
        sq.addEventListener('click', () => selectSquare(r, c));
      }
      boardEl.appendChild(sq);
    }
  }

  const promoOverlay = $('#promo-overlay');
  promoOverlay.innerHTML = '';
  if (pendingPromotion) {
    promoOverlay.classList.add('show');
    const box = document.createElement('div');
    box.className = 'promo-box';
    for (const type of ['Q', 'R', 'B', 'N']) {
      const btn = document.createElement('div');
      btn.className = 'promo-choice';
      btn.textContent = GLYPH[type];
      btn.addEventListener('click', () => choosePromotion(type));
      box.appendChild(btn);
    }
    promoOverlay.appendChild(box);
  } else {
    promoOverlay.classList.remove('show');
  }

  const controls = $('#controls');
  controls.innerHTML = '';
  if (state.status === 'checkmate') {
    controls.appendChild(msg(`Checkmate — ${state.winner === HUMAN ? 'You win!' : 'CPU wins.'}`));
  } else if (state.status === 'stalemate') {
    controls.appendChild(msg('Stalemate — draw.'));
  } else if (state.turn !== HUMAN) {
    controls.appendChild(msg('CPU is thinking...'));
  } else {
    controls.appendChild(msg(state.status === 'check' ? 'Check! Your turn.' : 'Your turn — pick a piece.'));
  }

  const logEl = $('#log');
  logEl.innerHTML = state.log.slice(-40).map(l => `<div>${escapeHtml(l)}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function msg(text) {
  const d = document.createElement('div');
  d.className = 'control-msg';
  d.textContent = text;
  return d;
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function boot() {
  render();
  $('#new-game-btn').addEventListener('click', () => {
    if (confirm('Start a new game?')) {
      state = newGame();
      selected = null;
      legalDests = [];
      pendingPromotion = null;
      render();
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);
