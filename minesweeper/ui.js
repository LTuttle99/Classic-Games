'use strict';

let difficulty = 'beginner';
let game = newGame(difficulty);
let timerHandle = null;

const $ = sel => document.querySelector(sel);

function startTimerIfNeeded() {
  if (timerHandle || !game.startedAt) return;
  timerHandle = setInterval(() => {
    $('#timer').textContent = String(Math.floor((Date.now() - game.startedAt) / 1000));
  }, 250);
}
function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

function flagModeOn() { return $('#flag-mode').checked; }

function handlePrimary(r, c) {
  if (game.phase === 'won' || game.phase === 'lost') return;
  if (flagModeOn()) {
    toggleFlag(game, r, c);
  } else {
    const cell = game.grid[r][c];
    if (cell.revealed) chord(game, r, c);
    else reveal(game, r, c);
  }
  startTimerIfNeeded();
  render();
  if (game.phase === 'won' || game.phase === 'lost') stopTimer();
}

function handleFlag(r, c) {
  if (game.phase === 'won' || game.phase === 'lost') return;
  toggleFlag(game, r, c);
  render();
}

function render() {
  $('#mines-left').textContent = game.mineCount - game.flagsUsed;
  $('#timer').textContent = game.startedAt ? String(Math.floor(((game.endedAt || Date.now()) - game.startedAt) / 1000)) : '0';

  const grid = $('#grid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = `repeat(${game.cols}, var(--cell))`;

  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const cell = game.grid[r][c];
      const el = document.createElement('div');
      el.className = 'cell';
      if (cell.revealed) {
        el.classList.add('revealed');
        if (cell.mine) {
          el.classList.add('mine-cell');
          el.textContent = '💣';
        } else if (cell.adjacent > 0) {
          el.classList.add(`n${cell.adjacent}`);
          el.textContent = String(cell.adjacent);
        }
      } else if (cell.flagged) {
        el.classList.add('flagged');
        el.textContent = '🚩';
      }
      el.addEventListener('click', () => handlePrimary(r, c));
      el.addEventListener('contextmenu', e => { e.preventDefault(); handleFlag(r, c); });
      grid.appendChild(el);
    }
  }

  document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('active', b.dataset.diff === difficulty));

  const status = $('#status-msg');
  if (game.phase === 'won') status.textContent = `You win! Cleared in ${Math.floor(((game.endedAt) - game.startedAt) / 1000)}s.`;
  else if (game.phase === 'lost') status.textContent = 'Boom! Game over.';
  else status.textContent = flagModeOn() ? 'Flag mode: tap to flag/unflag.' : 'Tap to reveal. Long-press or right-click to flag.';
}

function restart() {
  stopTimer();
  game = newGame(difficulty);
  render();
}

function boot() {
  render();
  $('#new-game-btn').addEventListener('click', restart);
  document.querySelectorAll('.diff-btn').forEach(b => {
    b.addEventListener('click', () => { difficulty = b.dataset.diff; restart(); });
  });
  $('#flag-mode').addEventListener('change', render);
}

document.addEventListener('DOMContentLoaded', boot);
