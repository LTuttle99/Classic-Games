'use strict';

const AI_DELAY = 900;

let game = newGame();

const $ = sel => document.querySelector(sel);

/* --------------------------------- AI step ------------------------------- */

function aiStep() {
  if (game.phase !== 'betting' || game.actingSeat === 0 || game.actingSeat === null) return;
  aiAct(game, game.actingSeat);
  scheduleNext();
}

/* --------------------------------- Human ---------------------------------- */

function humanFold() {
  if (game.phase !== 'betting' || game.actingSeat !== 0) return;
  fold(game);
  scheduleNext();
}
function humanCheckCall() {
  if (game.phase !== 'betting' || game.actingSeat !== 0) return;
  checkOrCall(game);
  scheduleNext();
}
function humanRaiseTo(amount) {
  if (game.phase !== 'betting' || game.actingSeat !== 0) return;
  const p = game.players[0];
  const minTo = game.currentBet + game.minRaise;
  const maxTo = p.stack + p.currentBet;
  const clamped = clamp(Math.round(amount), Math.min(minTo, maxTo), maxTo);
  if (betOrRaise(game, clamped)) scheduleNext();
}
function humanAllIn() {
  const p = game.players[0];
  humanRaiseTo(p.stack + p.currentBet);
}

function humanNextHand() {
  if (game.phase !== 'hand-over') return;
  nextHand(game);
  scheduleNext();
}
function humanNewGame() {
  resetStacks(game);
  nextHand(game);
  scheduleNext();
}

/* ------------------------------- Scheduler --------------------------------- */

function scheduleNext() {
  render();
  if (game.phase === 'betting' && game.actingSeat !== null && game.actingSeat !== 0) {
    setTimeout(aiStep, AI_DELAY);
  }
}

/* --------------------------------- Rendering -------------------------------- */

function cardEl(card, { faceUp = true, small = false, winning = false } = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (faceUp ? '' : ' card-back') + (small ? ' small' : '') + (winning ? ' winning' : '');
  if (faceUp) {
    el.classList.add(SUIT_COLOR[card.suit]);
    el.innerHTML = `<span class="corner top">${card.rank}<br>${SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="pip">${SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="corner bottom">${card.rank}<br>${SUIT_SYMBOL[card.suit]}</span>`;
  }
  return el;
}

function render() {
  renderStacks();
  renderSeats();
  renderCenter();
  renderControls();
  renderLog();
}

function renderStacks() {
  const el = $('#stacks');
  el.innerHTML = '';
  for (const s of SEATS) {
    const p = game.players[s];
    const pill = document.createElement('div');
    pill.className = 'score-pill' + (p.busted ? ' busted' : '');
    pill.innerHTML = `<span>${SEAT_NAME[s]}</span><span>$${p.stack}</span>`;
    el.appendChild(pill);
  }
}

function showdownEntryFor(seat) {
  if (!game.showdown) return null;
  return game.showdown.results.find(r => r.seat === seat) || null;
}

function renderSeats() {
  for (const seat of SEATS) {
    const p = game.players[seat];
    const container = $(`#hand-${seat}`);
    container.innerHTML = '';
    const sdEntry = showdownEntryFor(seat);
    const isWinner = game.showdown && game.showdown.winners.includes(seat);

    if (p.busted) {
      // no cards
    } else if (seat === 0) {
      for (const c of p.holeCards) container.appendChild(cardEl(c));
    } else if (sdEntry) {
      for (const c of p.holeCards) container.appendChild(cardEl(c, { winning: isWinner }));
    } else if (p.folded) {
      // mucked, show nothing
    } else if (p.holeCards.length > 0) {
      for (let i = 0; i < 2; i++) container.appendChild(cardEl(null, { faceUp: false }));
    }

    if (sdEntry) {
      const desc = document.createElement('div');
      desc.className = 'showdown-desc';
      desc.textContent = sdEntry.desc;
      container.appendChild(desc);
    }

    const label = $(`#label-${seat}`);
    label.classList.toggle('active-turn', game.phase === 'betting' && game.actingSeat === seat);
    label.classList.toggle('folded', p.folded || p.busted);
    label.classList.toggle('dealer', game.dealerSeat === seat && !p.busted);

    const betEl = $(`#bet-${seat}`);
    betEl.textContent = (!p.busted && p.currentBet > 0) ? `$${p.currentBet}` : '';
  }
}

function renderCenter() {
  $('#pot-display').innerHTML = `Pot: <b>$${game.pot}</b>`;
  $('#street-label').textContent = game.phase === 'hand-over' ? '' : game.street;
  const el = $('#community');
  el.innerHTML = '';
  for (const c of game.community) el.appendChild(cardEl(c));
  for (let i = game.community.length; i < 5; i++) el.appendChild(cardEl(null, { faceUp: false, small: false }));
  // ghost placeholders for undealt community cards, faint
  Array.from(el.children).slice(game.community.length).forEach(c => c.style.opacity = '0.15');
}

function renderControls() {
  const el = $('#controls');
  el.innerHTML = '';

  if (game.phase === 'game-over') {
    el.appendChild(msg(`${SEAT_NAME[game.winner.seat]} wins the table!`));
    el.appendChild(btn('New Game', humanNewGame));
    return;
  }

  if (game.phase === 'hand-over') {
    el.appendChild(msg('Hand complete.'));
    el.appendChild(btn('Next Hand', humanNextHand));
    return;
  }

  if (game.actingSeat !== 0) {
    el.appendChild(msg(`Waiting for ${SEAT_NAME[game.actingSeat]}...`));
    return;
  }

  const p = game.players[0];
  const toCall = amountToCall(game, 0);
  el.appendChild(msg(toCall > 0 ? `To call: $${toCall} — Pot: $${game.pot}` : `Your turn — Pot: $${game.pot}`));

  const row = document.createElement('div');
  row.className = 'btn-row';
  row.appendChild(btn('Fold', humanFold));
  row.appendChild(btn(toCall > 0 ? `Call $${toCall}` : 'Check', humanCheckCall));

  const minTo = Math.min(game.currentBet + game.minRaise, p.stack + p.currentBet);
  const maxTo = p.stack + p.currentBet;
  if (maxTo > game.currentBet) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'raise-input';
    input.min = String(minTo);
    input.max = String(maxTo);
    input.value = String(minTo);
    input.id = 'raise-input';
    row.appendChild(input);
    row.appendChild(btn('Raise', () => humanRaiseTo(parseInt(input.value, 10) || minTo)));
    row.appendChild(btn('All In', humanAllIn));
  }
  el.appendChild(row);

  if (maxTo > game.currentBet) {
    const presetRow = document.createElement('div');
    presetRow.className = 'btn-row';
    const halfPot = clamp(game.currentBet + Math.round(game.pot / 2), minTo, maxTo);
    const potSize = clamp(game.currentBet + game.pot, minTo, maxTo);
    presetRow.appendChild(smallBtn(`½ Pot ($${halfPot})`, () => { $('#raise-input').value = halfPot; }));
    presetRow.appendChild(smallBtn(`Pot ($${potSize})`, () => { $('#raise-input').value = potSize; }));
    el.appendChild(presetRow);
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
function smallBtn(text, onClick) {
  const b = btn(text, onClick);
  b.style.fontSize = '0.75rem';
  b.style.padding = '5px 10px';
  b.style.background = '#00000055';
  b.style.color = '#f2f2f2';
  b.style.border = '1px solid #ffffff33';
  return b;
}

function renderLog() {
  const el = $('#log');
  el.innerHTML = game.log.slice(-40).map(l => `<div>${escapeHtml(l)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function boot() {
  if (activeCount(game) < 2) resetStacks(game);
  nextHand(game);
  scheduleNext();
  $('#new-game-btn').addEventListener('click', () => {
    if (confirm('Reset all stacks to $1000 and start over?')) humanNewGame();
  });
}

document.addEventListener('DOMContentLoaded', boot);
