'use strict';

let game = newGame();

const $ = sel => document.querySelector(sel);
const CHIP_VALUES = [10, 25, 100, 500];
const CHIP_COLORS = { 10: '#2f6fb3', 25: '#2f9e52', 100: '#b33a3a', 500: '#7a3ab3' };

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

function render() {
  $('#balance').textContent = game.balance;
  $('#bet').textContent = game.bet;

  const dealerHiddenHole = game.phase === 'player-turn';
  const dealerEl = $('#dealer-hand');
  dealerEl.innerHTML = '';
  game.dealer.forEach((c, i) => {
    dealerEl.appendChild(cardEl(c, { faceUp: !(dealerHiddenHole && i === 1) }));
  });
  $('#dealer-total').textContent = (game.dealer.length && !dealerHiddenHole)
    ? `(${handTotal(game.dealer).total})` : (game.dealer.length ? '' : '');

  const playerEl = $('#player-hand');
  playerEl.innerHTML = '';
  game.player.forEach(c => playerEl.appendChild(cardEl(c)));
  $('#player-total').textContent = game.player.length ? `(${handTotal(game.player).total})` : '';

  renderControls();

  const logEl = $('#log');
  logEl.innerHTML = game.log.slice(-40).map(l => `<div>${escapeHtml(l)}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function renderControls() {
  const el = $('#controls');
  el.innerHTML = '';

  if (game.phase === 'betting') {
    if (game.balance <= 0 && game.bet === 0) {
      el.appendChild(msg("You're out of chips. Reset your bankroll to keep playing."));
      return;
    }
    const tray = document.createElement('div');
    tray.className = 'chip-tray';
    for (const v of CHIP_VALUES) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.style.setProperty('--chip-color', CHIP_COLORS[v]);
      chip.textContent = `$${v}`;
      chip.disabled = game.balance - game.bet < v;
      chip.addEventListener('click', () => { placeBet(game, v); render(); });
      tray.appendChild(chip);
    }
    el.appendChild(tray);

    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(btn('Clear Bet', () => { clearBet(game); render(); }, game.bet === 0));
    row.appendChild(btn('Deal', () => { deal(game); render(); }, game.bet === 0));
    el.appendChild(row);
  } else if (game.phase === 'player-turn') {
    el.appendChild(msg('Hit, stand, or double down.'));
    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(btn('Hit', () => { hit(game); render(); }));
    row.appendChild(btn('Stand', () => { stand(game); render(); }));
    const canDouble = game.player.length === 2 && game.balance >= game.bet;
    row.appendChild(btn('Double Down', () => { double(game); render(); }, !canDouble));
    el.appendChild(row);
  } else if (game.phase === 'hand-over') {
    const outcomeText = {
      blackjack: `Blackjack! You win $${game.lastPayout - game.bet}.`,
      win: `You win $${game.lastPayout - game.bet}!`,
      push: 'Push — bet returned.',
      lose: `You lose $${game.bet}.`,
    }[game.outcome];
    const outcomeClass = { blackjack: 'outcome-win', win: 'outcome-win', push: 'outcome-push', lose: 'outcome-lose' }[game.outcome];
    el.appendChild(msg(outcomeText, outcomeClass));
    el.appendChild(btn('Next Hand', () => { nextHand(game); render(); }));
  } else {
    el.appendChild(msg('Dealer playing…'));
  }
}

function msg(text, cls) {
  const d = document.createElement('div');
  d.className = 'control-msg' + (cls ? ' ' + cls : '');
  d.textContent = text;
  return d;
}
function btn(text, onClick, disabled) {
  const b = document.createElement('button');
  b.textContent = text;
  b.disabled = !!disabled;
  b.addEventListener('click', onClick);
  return b;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function boot() {
  render();
  $('#new-game-btn').addEventListener('click', () => {
    if (confirm('Reset your bankroll to $1000? This discards your current chip balance.')) {
      resetBankroll(game);
      render();
    }
  });
}

document.addEventListener('DOMContentLoaded', boot);
