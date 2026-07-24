'use strict';

/* =========================================================================
   UI controller: wires the game engine (game.js) to the DOM.
   ========================================================================= */

const AI_DELAY = 850; // ms, purely cosmetic pacing so AI turns feel natural
const TRICK_CLEAR_DELAY = 1100; // ms, how long a finished trick stays on the table

let game = newGame();

/* ------------------------------ Bid actions ------------------------------ */

function orderUpAction(seat, alone) {
  game.phase = 'bid1-discard';
  setTrumpAndMaker(game, game.upCard.suit, seat, alone);
  game.hands[game.dealer].push(game.upCard);
  game.upCardTaken = true;
  log(game, `${subj(seat)} ${verbFor(seat, 'order', 'orders')} it up — trump is ${SUIT_NAME[game.trump]}${alone ? ' (going ALONE)' : ''}.`);
}

function passAction(seat) {
  log(game, `${subj(seat)} ${verbFor(seat, 'pass', 'passes')}.`);
  if (seat === game.dealer) {
    startBid2(game);
  } else {
    game.biddingTurn = leftOf(seat);
  }
}

function startBid2(game) {
  game.turnedDownSuit = game.upCard.suit;
  game.phase = 'bid2';
  game.biddingTurn = leftOf(game.dealer);
  log(game, `${cardLabel(game.upCard)} is turned down.`);
}

function callSuitAction(seat, suit, alone) {
  setTrumpAndMaker(game, suit, seat, alone);
  log(game, `${subj(seat)} ${verbFor(seat, 'call', 'calls')} ${SUIT_NAME[suit]}${alone ? ' (going ALONE)' : ''}.`);
  beginPlay(game);
}

function passBid2Action(seat) {
  log(game, `${subj(seat)} ${verbFor(seat, 'pass', 'passes')}.`);
  game.biddingTurn = leftOf(seat);
}

function discardAction(card) {
  removeCard(game.hands[game.dealer], card);
  log(game, `${subj(game.dealer)} ${verbFor(game.dealer, 'discard', 'discards')}.`);
  beginPlay(game);
}

/* --------------------------------- AI steps -------------------------------- */

function aiBid1Step() {
  if (game.phase !== 'bid1') return;
  const seat = game.biddingTurn;
  if (seat === 0) return;
  const decision = aiDecideOrderUp(game, seat);
  if (decision.action === 'order') orderUpAction(seat, decision.alone);
  else passAction(seat);
  scheduleNext();
}

function aiBid2Step() {
  if (game.phase !== 'bid2') return;
  const seat = game.biddingTurn;
  if (seat === 0) return;
  const stuck = seat === game.dealer;
  let decision = aiDecideCallSuit(game, seat);
  if (stuck && decision.action === 'pass') {
    const suit = decision.bestSuit || SUITS.find(s => s !== game.turnedDownSuit);
    decision = { action: 'call', suit, alone: false };
  }
  if (decision.action === 'call') callSuitAction(seat, decision.suit, decision.alone);
  else passBid2Action(seat);
  scheduleNext();
}

function aiDiscardStep() {
  if (game.phase !== 'bid1-discard' || game.dealer === 0) return;
  const worst = bestDiscard(game.hands[game.dealer], game.trump);
  discardAction(worst);
  scheduleNext();
}

function aiPlayStep() {
  if (game.phase !== 'play') return;
  const seat = game.turn;
  if (seat === 0 || seat === game.sittingOut) return;
  const card = aiChooseCard(game, seat);
  playCard(game, seat, card);
  scheduleNext();
}

/* --------------------------------- Human ---------------------------------- */

function humanOrder(alone) {
  if (game.phase !== 'bid1' || game.biddingTurn !== 0) return;
  orderUpAction(0, alone);
  scheduleNext();
}
function humanPassBid1() {
  if (game.phase !== 'bid1' || game.biddingTurn !== 0) return;
  passAction(0);
  scheduleNext();
}
function humanCallSuit(suit, alone) {
  if (game.phase !== 'bid2' || game.biddingTurn !== 0) return;
  callSuitAction(0, suit, alone);
  scheduleNext();
}
function humanPassBid2() {
  if (game.phase !== 'bid2' || game.biddingTurn !== 0) return;
  if (game.dealer === 0) return; // stuck, can't pass
  passBid2Action(0);
  scheduleNext();
}
function humanDiscard(card) {
  if (game.phase !== 'bid1-discard' || game.dealer !== 0) return;
  discardAction(card);
  scheduleNext();
}
function humanPlay(card) {
  if (game.phase !== 'play' || game.turn !== 0 || game.awaitingClear) return;
  const legal = legalPlays(game.hands[0], game.currentTrick, game.trump);
  if (!legal.some(c => c.id === card.id)) return;
  playCard(game, 0, card);
  scheduleNext();
}
function humanContinue() {
  if (game.phase !== 'hand-over') return;
  advanceHand(game);
  scheduleNext();
}
function humanNewGame() {
  game = newGame();
  startHand(game);
  scheduleNext();
}

/* ------------------------------- Scheduler --------------------------------- */

function scheduleNext() {
  render();
  if (game.phase === 'play' && game.awaitingClear) {
    setTimeout(() => {
      game.currentTrick = [];
      game.awaitingClear = false;
      scheduleNext();
    }, TRICK_CLEAR_DELAY);
    return;
  }
  if (game.phase === 'bid1' && game.biddingTurn !== 0) {
    setTimeout(aiBid1Step, AI_DELAY);
  } else if (game.phase === 'bid2' && game.biddingTurn !== 0) {
    setTimeout(aiBid2Step, AI_DELAY);
  } else if (game.phase === 'bid1-discard' && game.dealer !== 0) {
    setTimeout(aiDiscardStep, AI_DELAY);
  } else if (game.phase === 'play' && game.turn !== 0 && game.turn !== game.sittingOut) {
    setTimeout(aiPlayStep, AI_DELAY);
  }
}

/* --------------------------------- Rendering -------------------------------- */

const $ = sel => document.querySelector(sel);

function cardEl(card, { faceUp = true, disabled = false, onClick = null, small = false } = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (faceUp ? '' : ' card-back') + (disabled ? ' disabled' : '') + (small ? ' small' : '');
  if (faceUp) {
    el.classList.add(SUIT_COLOR[card.suit]);
    el.innerHTML = `<span class="corner top">${card.rank}<br>${SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="pip">${SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="corner bottom">${card.rank}<br>${SUIT_SYMBOL[card.suit]}</span>`;
    el.setAttribute('aria-label', `${card.rank} of ${SUIT_NAME[card.suit]}`);
  }
  if (onClick && !disabled) {
    el.addEventListener('click', onClick);
    el.classList.add('clickable');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
  }
  return el;
}

function render() {
  renderScoreboard();
  renderSeats();
  renderCenter();
  renderControls();
  renderLog();
}

function renderScoreboard() {
  $('#score-you').textContent = game.scores[0];
  $('#score-them').textContent = game.scores[1];
  $('#dealer-indicator').textContent = `Dealer: ${SEAT_NAME[game.dealer]}`;
  $('#trump-indicator').textContent = game.trump
    ? `Trump: ${SUIT_SYMBOL[game.trump]} ${SUIT_NAME[game.trump]}` : '';
}

function renderSeats() {
  // North, West, East as card-back fans; South as interactive hand
  for (const seat of [1, 2, 3]) {
    const container = $(`#hand-${seat}`);
    container.innerHTML = '';
    const n = game.hands[seat].length;
    if (seat === game.sittingOut) {
      container.appendChild(Object.assign(document.createElement('div'), { className: 'sitting-out-label', textContent: 'sitting out' }));
      continue;
    }
    for (let i = 0; i < n; i++) container.appendChild(cardEl(null, { faceUp: false, small: true }));
  }
  $('#label-1').classList.toggle('active-turn', isTurnIndicator(1));
  $('#label-2').classList.toggle('active-turn', isTurnIndicator(2));
  $('#label-3').classList.toggle('active-turn', isTurnIndicator(3));
  $('#label-0').classList.toggle('active-turn', isTurnIndicator(0));

  const southContainer = $('#hand-0');
  southContainer.innerHTML = '';
  if (game.sittingOut === 0) {
    southContainer.appendChild(Object.assign(document.createElement('div'), { className: 'sitting-out-label', textContent: 'You are sitting out this hand' }));
    return;
  }
  const hand = sortHand(game.hands[0].slice(), game.trump);
  let legal = hand;
  if (game.phase === 'play' && game.turn === 0 && !game.awaitingClear) {
    legal = legalPlays(game.hands[0], game.currentTrick, game.trump);
  }
  const discardMode = game.phase === 'bid1-discard' && game.dealer === 0;
  const interactivePhase = game.phase === 'play' || discardMode;
  for (const card of hand) {
    const isLegal = discardMode ? true : legal.some(c => c.id === card.id);
    const clickable = (game.phase === 'play' && game.turn === 0 && !game.awaitingClear && isLegal) || discardMode;
    southContainer.appendChild(cardEl(card, {
      faceUp: true,
      disabled: interactivePhase && !clickable,
      onClick: clickable ? () => (discardMode ? humanDiscard(card) : humanPlay(card)) : null,
    }));
  }
}

function isTurnIndicator(seat) {
  if (game.phase === 'bid1' || game.phase === 'bid2') return game.biddingTurn === seat;
  if (game.phase === 'bid1-discard') return game.dealer === seat;
  if (game.phase === 'play') return game.turn === seat;
  return false;
}

function renderCenter() {
  const kittyEl = $('#kitty-area');
  kittyEl.innerHTML = '';
  if (game.phase === 'bid1' || (game.phase === 'bid1-discard')) {
    kittyEl.appendChild(cardEl(game.upCard, { faceUp: true }));
  } else if (game.phase === 'bid2') {
    kittyEl.appendChild(cardEl(null, { faceUp: false }));
    const label = document.createElement('div');
    label.className = 'turned-down-label';
    label.textContent = `${cardLabel({ rank: game.upCard.rank, suit: game.upCard.suit })} turned down`;
    kittyEl.appendChild(label);
  }

  for (const seat of SEATS) {
    const spot = $(`#trick-${seat}`);
    spot.innerHTML = '';
    const played = game.currentTrick.find(t => t.seat === seat) ||
      (game.tricks.length > 0 && game.phase === 'play' ? null : null);
    if (played) spot.appendChild(cardEl(played.card, { faceUp: true, small: true }));
  }

  // briefly show the last completed trick's cards until next card is led (handled by currentTrick reset already)
}

function renderControls() {
  const el = $('#controls');
  el.innerHTML = '';

  if (game.phase === 'bid1' && game.biddingTurn === 0) {
    el.appendChild(msg(`Your turn: order up ${cardLabel(game.upCard)}?`));
    el.appendChild(btn('Order it up', () => humanOrder(getAloneChecked())));
    el.appendChild(btn('Pass', () => humanPassBid1()));
    el.appendChild(aloneCheckbox());
  } else if (game.phase === 'bid2' && game.biddingTurn === 0) {
    const stuck = game.dealer === 0;
    el.appendChild(msg(stuck ? 'You are stuck — you must call a suit.' : 'Call trump or pass.'));
    for (const suit of SUITS) {
      if (suit === game.turnedDownSuit) continue;
      el.appendChild(btn(`${SUIT_SYMBOL[suit]} ${SUIT_NAME[suit]}`, () => humanCallSuit(suit, getAloneChecked())));
    }
    if (!stuck) el.appendChild(btn('Pass', () => humanPassBid2()));
    el.appendChild(aloneCheckbox());
  } else if (game.phase === 'bid1-discard' && game.dealer === 0) {
    el.appendChild(msg('Pick a card to discard.'));
  } else if (game.phase === 'hand-over') {
    const s = game.lastHandSummary;
    const teamName = s.winningTeam === 0 ? 'Your team' : 'West/East';
    el.appendChild(msg(`${teamName} scored ${s.points} point${s.points === 1 ? '' : 's'}.`));
    el.appendChild(btn('Continue', () => humanContinue()));
  } else if (game.phase === 'game-over') {
    const winner = game.scores[0] >= 10 ? 'You and your partner win!' : 'West/East win.';
    el.appendChild(msg(winner));
    el.appendChild(btn('New Game', () => humanNewGame()));
  } else if (game.phase === 'play') {
    if (game.awaitingClear) el.appendChild(msg(`${SEAT_NAME[game.turn]} won the trick.`));
    else if (game.turn === 0) el.appendChild(msg('Your turn — play a card.'));
    else el.appendChild(msg(`Waiting for ${SEAT_NAME[game.turn]}...`));
  } else {
    el.appendChild(msg('Waiting...'));
  }
}

function getAloneChecked() {
  const cb = $('#alone-checkbox');
  return !!(cb && cb.checked);
}

function aloneCheckbox() {
  const wrap = document.createElement('label');
  wrap.className = 'alone-label';
  wrap.innerHTML = `<input type="checkbox" id="alone-checkbox"> Go alone`;
  return wrap;
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

function renderLog() {
  const el = $('#log');
  el.innerHTML = game.log.slice(-40).map(l => `<div>${escapeHtml(l)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --------------------------------- Boot ------------------------------------ */

function boot() {
  startHand(game);
  scheduleNext();
  $('#new-game-btn').addEventListener('click', () => {
    if (confirm('Start a new game? Current progress will be lost.')) humanNewGame();
  });
}

document.addEventListener('DOMContentLoaded', boot);
