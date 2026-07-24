'use strict';

let game = newGame();

const $ = sel => document.querySelector(sel);

function move(direction) {
  if (applyMove(game, direction)) render();
}

function render() {
  $('#score').textContent = game.score;
  $('#best').textContent = game.best;

  const tiles = $('#tiles');
  tiles.innerHTML = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = game.board[r][c];
      if (!v) continue;
      const t = document.createElement('div');
      t.className = 'tile ' + (v <= 2048 ? `tile-${v}` : 'tile-super');
      t.style.gridRow = String(r + 1);
      t.style.gridColumn = String(c + 1);
      t.textContent = v;
      tiles.appendChild(t);
    }
  }

  const overlay = $('#overlay');
  overlay.innerHTML = '';
  overlay.classList.remove('show');
  if (game.over) {
    overlay.classList.add('show');
    overlay.appendChild(overlayMsg('Game Over'));
    overlay.appendChild(overlayBtn('Try Again', () => { game = newGame(); render(); }));
  } else if (game.won && !game.keepPlaying) {
    overlay.classList.add('show');
    overlay.appendChild(overlayMsg('You reached 2048!'));
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.appendChild(overlayBtn('Keep Going', () => { continueGame(game); render(); }));
    row.appendChild(overlayBtn('New Game', () => { game = newGame(); render(); }));
    overlay.appendChild(row);
  }
}

function overlayMsg(text) {
  const d = document.createElement('div');
  d.className = 'overlay-msg';
  d.textContent = text;
  return d;
}
function overlayBtn(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function initGrid() {
  const bg = $('#grid-bg');
  bg.innerHTML = '';
  for (let i = 0; i < SIZE * SIZE; i++) {
    const c = document.createElement('div');
    c.className = 'cell-bg';
    bg.appendChild(c);
  }
}

const KEY_DIR = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  a: 'left', d: 'right', w: 'up', s: 'down',
  A: 'left', D: 'right', W: 'up', S: 'down',
};

function boot() {
  initGrid();
  render();
  $('#new-game-btn').addEventListener('click', () => {
    game = newGame();
    render();
  });

  document.addEventListener('keydown', e => {
    const dir = KEY_DIR[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  });

  let touchStart = null;
  const board = $('#board-wrap');
  board.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  board.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', boot);
