'use strict';

const AI_DELAY = 500;

let game = newGame();

const $ = sel => document.querySelector(sel);

function humanPlay(col) {
  if (game.winner || game.turn !== HUMAN) return;
  if (!play(game, col)) return;
  render();
  if (!game.winner && game.turn === AI) {
    setTimeout(() => { aiMove(game); render(); }, AI_DELAY);
  }
}

function isWinCell(col, row) {
  return game.winCells && game.winCells.some(([c, r]) => c === col && r === row);
}

function render() {
  const board = $('#board');
  board.innerHTML = '';
  const clickable = !game.winner && game.turn === HUMAN;
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + (isWinCell(c, r) ? ' win' : '');
      const piece = game.board[c][r];
      if (piece) {
        const p = document.createElement('div');
        p.className = 'piece ' + piece.toLowerCase();
        cell.appendChild(p);
      }
      const colFull = game.board[c].length >= ROWS;
      if (clickable && !colFull) {
        cell.setAttribute('role', 'button');
        cell.setAttribute('tabindex', '0');
        cell.setAttribute('aria-label', `Column ${c + 1}`);
        cell.addEventListener('click', () => humanPlay(c));
        cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); humanPlay(c); } });
      }
      board.appendChild(cell);
    }
  }

  $('#score-r').textContent = game.scores.R;
  $('#score-y').textContent = game.scores.Y;
  $('#score-draw').textContent = game.scores.draw;

  const controls = $('#controls');
  controls.innerHTML = '';
  if (game.winner) {
    const text = game.winner === 'draw' ? "It's a draw." : game.winner === HUMAN ? 'You win!' : 'CPU wins.';
    controls.appendChild(msg(text));
    controls.appendChild(btn('Play Again', () => { newRound(game); render(); }));
  } else {
    controls.appendChild(msg(game.turn === HUMAN ? 'Your turn — click a column.' : 'CPU is thinking...'));
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
