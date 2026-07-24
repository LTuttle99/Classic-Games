'use strict';

const AI_DELAY = 650;

let game = newGame();
let selected = null;       // {r,c} or null
let legalDests = [];        // moves available from `selected`

const $ = sel => document.querySelector(sel);

function key(r, c) { return `${r},${c}`; }

function selectSquare(r, c) {
  if (game.winner || game.turn !== HUMAN) return;
  const piece = game.board[r][c];
  if (selected && selected.r === r && selected.c === c) { selected = null; legalDests = []; render(); return; }
  if (!piece || piece.color !== HUMAN) return;

  const moves = legalMovesFor(game, r, c);
  if (moves.length === 0) return; // not selectable (e.g. a mandatory capture exists elsewhere)
  selected = { r, c };
  legalDests = moves;
  render();
}

function tryMoveTo(r, c) {
  const move = legalDests.find(m => m.to.r === r && m.to.c === c);
  if (!move) return;
  playMove(game, move);
  selected = null;
  legalDests = [];
  render();
  if (!game.winner && game.turn === AI) {
    setTimeout(() => { aiMove(game); render(); }, AI_DELAY);
  }
}

function render() {
  $('#count-r').textContent = pieceCount(game.board, HUMAN);
  $('#count-b').textContent = pieceCount(game.board, AI);

  const boardEl = $('#board');
  boardEl.innerHTML = '';
  const legalFroms = new Set(
    (!game.winner && game.turn === HUMAN ? currentLegalMoves(game) : []).map(m => key(m.from.r, m.from.c))
  );
  const destKeys = new Set(legalDests.map(m => key(m.to.r, m.to.c)));

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const sq = document.createElement('div');
      const playable = (r + c) % 2 === 1;
      sq.className = 'square ' + (playable ? 'dark' : 'light');
      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');
      if (game.lastMove && ((game.lastMove.from.r === r && game.lastMove.from.c === c))) sq.classList.add('last-from');
      if (game.lastMove && game.lastMove.to.r === r && game.lastMove.to.c === c) sq.classList.add('last-to');

      const piece = game.board[r][c];
      if (piece) {
        const p = document.createElement('div');
        p.className = `piece ${piece.color.toLowerCase()}` + (legalFroms.has(key(r, c)) ? ' clickable' : '');
        if (piece.king) p.textContent = '♛';
        p.addEventListener('click', () => selectSquare(r, c));
        sq.appendChild(p);
      } else if (destKeys.has(key(r, c))) {
        sq.classList.add('selectable');
        sq.addEventListener('click', () => tryMoveTo(r, c));
      }
      boardEl.appendChild(sq);
    }
  }

  const controls = $('#controls');
  controls.innerHTML = '';
  if (game.winner) {
    controls.appendChild(msg(game.winner === HUMAN ? 'You win!' : 'CPU wins.'));
  } else if (game.turn === HUMAN) {
    const forcedCapture = currentLegalMoves(game).some(m => m.captures.length > 0);
    controls.appendChild(msg(forcedCapture ? 'Capture is mandatory — pick a highlighted piece.' : 'Your turn — pick a piece.'));
  } else {
    controls.appendChild(msg('CPU is thinking...'));
  }

  const logEl = $('#log');
  logEl.innerHTML = game.log.slice(-30).map(l => `<div>${escapeHtml(l)}</div>`).join('');
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
      game = newGame();
      selected = null;
      legalDests = [];
      render();
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);
