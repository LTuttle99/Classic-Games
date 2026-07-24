'use strict';

let game = newGame();
let autoTimer = null;

const $ = sel => document.querySelector(sel);

function step() {
  playRound(game);
  render();
  if (game.gameOver && autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}

function setAuto(on) {
  if (on && !autoTimer) {
    autoTimer = setInterval(() => {
      if (game.gameOver) { clearInterval(autoTimer); autoTimer = null; return; }
      step();
    }, 550);
  } else if (!on && autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
}

function newGameHandler() {
  game = newGame();
  setAuto(false);
  $('#auto-toggle').checked = false;
  render();
}

function cardEl(card, { faceUp = true } = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (faceUp ? '' : ' card-back');
  if (faceUp) {
    el.classList.add(SUIT_COLOR[card.suit]);
    el.innerHTML = `<span class="corner top">${card.rank}<br>${SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="pip">${SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="corner bottom">${card.rank}<br>${SUIT_SYMBOL[card.suit]}</span>`;
  }
  return el;
}

function warGroupEl(label, cards) {
  const wrap = document.createElement('div');
  wrap.className = 'war-group';
  const stack = document.createElement('div');
  stack.className = 'stack';
  cards.forEach(t => stack.appendChild(cardEl(t.card, { faceUp: t.faceUp })));
  const tag = document.createElement('div');
  tag.className = 'war-tag';
  tag.textContent = label;
  wrap.appendChild(stack);
  wrap.appendChild(tag);
  return wrap;
}

function render() {
  $('#count-player').textContent = game.player.length;
  $('#count-cpu').textContent = game.cpu.length;
  $('#player-pile').textContent = game.player.length > 0 ? game.player.length : '';
  $('#cpu-pile').textContent = game.cpu.length > 0 ? game.cpu.length : '';

  const bf = $('#battlefield');
  bf.innerHTML = '';
  const playerCards = game.table.filter(t => t.owner === 'player');
  const cpuCards = game.table.filter(t => t.owner === 'cpu');
  if (playerCards.length || cpuCards.length) {
    bf.appendChild(warGroupEl('You', playerCards));
    bf.appendChild(warGroupEl('Opponent', cpuCards));
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'control-msg';
    placeholder.textContent = 'Click Flip to play a round';
    bf.appendChild(placeholder);
  }

  const controls = $('#controls');
  controls.innerHTML = '';
  if (game.gameOver) {
    const msg = document.createElement('div');
    msg.className = 'control-msg';
    msg.textContent = game.winner === 'player' ? 'You win the whole deck!' : 'Opponent wins the whole deck.';
    controls.appendChild(msg);
  } else {
    if (game.warDepth > 0) {
      const msg = document.createElement('div');
      msg.className = 'control-msg';
      msg.textContent = 'War! Flip again to settle it.';
      controls.appendChild(msg);
    }
    const flipBtn = document.createElement('button');
    flipBtn.textContent = game.warDepth > 0 ? 'Flip (War)' : 'Flip';
    flipBtn.disabled = !!autoTimer;
    flipBtn.addEventListener('click', step);
    controls.appendChild(flipBtn);
  }

  const logEl = $('#log');
  logEl.innerHTML = game.log.slice(-40).map(l => `<div>${escapeHtml(l)}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function boot() {
  render();
  $('#new-game-btn').addEventListener('click', () => {
    if (confirm('Start a new game? Current progress will be lost.')) newGameHandler();
  });
  $('#auto-toggle').addEventListener('change', e => setAuto(e.target.checked));
}

document.addEventListener('DOMContentLoaded', boot);
