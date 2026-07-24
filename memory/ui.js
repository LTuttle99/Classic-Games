'use strict';

const MISMATCH_DELAY = 800;

let pairCount = 8;
let game = newGame(pairCount);
let timerHandle = null;

const $ = sel => document.querySelector(sel);

function gridCols() { return pairCount === 8 ? 4 : 6; }

function humanFlip(index) {
  if (!flip(game, index)) return;
  render();
  startTimerIfNeeded();
  if (game.locked) {
    setTimeout(() => { resolveMismatch(game); render(); }, MISMATCH_DELAY);
  }
  if (game.won) stopTimer();
}

function startTimerIfNeeded() {
  if (timerHandle || !game.startedAt) return;
  timerHandle = setInterval(() => {
    $('#timer').textContent = formatTime(Date.now() - game.startedAt);
  }, 250);
}
function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function render() {
  $('#moves').textContent = game.moves;
  if (!game.startedAt) $('#timer').textContent = '0:00';
  else if (game.endedAt) $('#timer').textContent = formatTime(game.endedAt - game.startedAt);

  const grid = $('#grid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${gridCols()}, var(--card))`;

  game.cards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'card' + (card.flipped || card.matched ? ' flipped' : '') + (card.matched ? ' matched' : '');
    el.innerHTML = `<div class="card-inner">
      <div class="card-face card-back"></div>
      <div class="card-face card-front">${card.symbol}</div>
    </div>`;
    if (!card.flipped && !card.matched && !game.locked && !game.won) {
      el.addEventListener('click', () => humanFlip(i));
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); humanFlip(i); } });
    }
    grid.appendChild(el);
  });

  document.querySelectorAll('.diff-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.pairs, 10) === pairCount);
  });

  const controls = $('#controls');
  controls.innerHTML = '';
  if (game.won) {
    const msg = document.createElement('div');
    msg.className = 'control-msg';
    msg.textContent = `Solved in ${game.moves} moves, ${formatTime(game.endedAt - game.startedAt)}!`;
    controls.appendChild(msg);
  } else {
    const msg = document.createElement('div');
    msg.className = 'control-msg';
    msg.textContent = 'Find every matching pair.';
    controls.appendChild(msg);
  }
}

function restart() {
  stopTimer();
  game = newGame(pairCount);
  render();
}

function boot() {
  render();
  $('#new-game-btn').addEventListener('click', restart);
  document.querySelectorAll('.diff-btn').forEach(b => {
    b.addEventListener('click', () => {
      pairCount = parseInt(b.dataset.pairs, 10);
      restart();
    });
  });
}

document.addEventListener('DOMContentLoaded', boot);
