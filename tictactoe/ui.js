'use strict';

const AI_DELAY = 450;

let game = newGame();

const $ = sel => document.querySelector(sel);

function humanPlay(index) {
  if (game.winner || game.turn !== 'X') return;
  if (!play(game, index)) return;
  render();
  if (!game.winner && game.turn === 'O') {
    setTimeout(() => { aiMove(game); render(); }, AI_DELAY);
  }
}

function render() {
  const board = $('#board');
  board.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    const val = game.board[i];
    cell.className = 'cell' + (val ? ` ${val.toLowerCase()}` : '') +
      (!val && !game.winner && game.turn === 'X' ? ' clickable' : '') +
      (game.winLine && game.winLine.includes(i) ? ' win' : '');
    cell.textContent = val || '';
    if (!val && !game.winner && game.turn === 'X') {
      cell.addEventListener('click', () => humanPlay(i));
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', `Cell ${i + 1}`);
      cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); humanPlay(i); } });
    }
    board.appendChild(cell);
  }

  $('#score-x').textContent = game.scores.X;
  $('#score-o').textContent = game.scores.O;
  $('#score-draw').textContent = game.scores.draw;

  const controls = $('#controls');
  controls.innerHTML = '';
  if (game.winner) {
    const text = game.winner === 'draw' ? "It's a draw." : game.winner === 'X' ? 'You win!' : 'CPU wins.';
    controls.appendChild(msg(text));
    controls.appendChild(btn('Play Again', () => { newRound(game); render(); }));
  } else {
    controls.appendChild(msg(game.turn === 'X' ? 'Your turn.' : "CPU is thinking..."));
  }
}

function msg(text) {
  const d = document.createElement('div');
  d.className = 'control-msg';
  d.textContent = text;
  return d;
}
function btn(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function boot() {
  render();
  $('#new-game-btn').addEventListener('click', () => {
    if (confirm('Reset the score?')) {
      game = newGame();
      render();
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);
