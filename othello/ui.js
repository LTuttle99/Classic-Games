'use strict';

const AI_DELAY = 600;

let game = newGame();

const $ = sel => document.querySelector(sel);

function humanPlay(r, c) {
  if (game.over || game.turn !== HUMAN) return;
  if (!playMove(game, r, c)) return;
  render();
  scheduleAiIfNeeded();
}

function scheduleAiIfNeeded() {
  if (!game.over && game.turn === AI) {
    setTimeout(() => { aiMove(game); render(); scheduleAiIfNeeded(); }, AI_DELAY);
  }
}

function render() {
  const counts = discCounts(game.board);
  $('#count-b').textContent = counts.B;
  $('#count-w').textContent = counts.W;

  const legal = (!game.over && game.turn === HUMAN) ? legalMoves(game.board, HUMAN) : [];
  const legalKeys = new Set(legal.map(m => `${m.r},${m.c}`));

  const boardEl = $('#board');
  boardEl.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const sq = document.createElement('div');
      sq.className = 'square';
      if (game.lastMove && game.lastMove.r === r && game.lastMove.c === c) sq.classList.add('last-move');
      const piece = game.board[r][c];
      if (piece) {
        const d = document.createElement('div');
        d.className = 'disc ' + piece.toLowerCase();
        sq.appendChild(d);
      } else if (legalKeys.has(`${r},${c}`)) {
        sq.classList.add('legal');
        sq.addEventListener('click', () => humanPlay(r, c));
      }
      boardEl.appendChild(sq);
    }
  }

  const controls = $('#controls');
  controls.innerHTML = '';
  if (game.over) {
    const text = game.winner === 'draw' ? "It's a tie!" : game.winner === HUMAN ? 'You win!' : 'CPU wins.';
    controls.appendChild(msg(text));
  } else if (game.turn === HUMAN) {
    controls.appendChild(msg(legal.length > 0 ? 'Your turn — tap a highlighted square.' : 'No legal move — passing...'));
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
  scheduleAiIfNeeded();
  $('#new-game-btn').addEventListener('click', () => {
    if (confirm('Start a new game?')) {
      game = newGame();
      render();
      scheduleAiIfNeeded();
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);
