'use strict';

const AI_DELAY = 800;

let game = newGame();

const $ = sel => document.querySelector(sel);

/* --------------------------------- AI steps -------------------------------- */

function aiTurnStep() {
  if (game.phase !== 'playing' || game.currentPlayer === 0) return;
  const seat = game.currentPlayer;
  const legal = legalPlays(game, seat);
  if (legal.length > 0) {
    const card = aiChooseCard(game, seat);
    const color = (card.type === 'wild' || card.type === 'wild4') ? aiChooseColor(game, seat) : undefined;
    playCard(game, seat, card.id, color);
  } else {
    const drawn = drawForTurn(game, seat);
    if (drawn && isPlayable(game, drawn, game.hands[seat])) {
      const color = (drawn.type === 'wild' || drawn.type === 'wild4') ? aiChooseColor(game, seat) : undefined;
      playCard(game, seat, drawn.id, color);
    } else if (drawn) {
      passTurn(game);
    }
  }
  scheduleNext();
}

function aiColorStep() {
  if (game.phase !== 'choose-color' || !game.pendingWild || game.pendingWild.seat === 0) return;
  chooseColor(game, aiChooseColor(game, game.pendingWild.seat));
  scheduleNext();
}

/* --------------------------------- Human ------------------------------------ */

function humanPlay(card) {
  if (game.phase !== 'playing' || game.currentPlayer !== 0 || game.awaitingDrawDecision) return;
  if (!isPlayable(game, card, game.hands[0])) return;
  playCard(game, 0, card.id);
  scheduleNext();
}

function humanChooseColor(color) {
  if (game.phase !== 'choose-color' || !game.pendingWild || game.pendingWild.seat !== 0) return;
  chooseColor(game, color);
  scheduleNext();
}

function humanDrawPile() {
  if (game.phase !== 'playing' || game.currentPlayer !== 0 || game.awaitingDrawDecision) return;
  if (legalPlays(game, 0).length > 0) return; // must play if able
  const drawn = drawForTurn(game, 0);
  if (drawn && isPlayable(game, drawn, game.hands[0])) {
    game.awaitingDrawDecision = drawn;
    render();
  } else {
    passTurn(game);
    scheduleNext();
  }
}

function humanPlayDrawn() {
  if (!game.awaitingDrawDecision) return;
  const card = game.awaitingDrawDecision;
  game.awaitingDrawDecision = null;
  playCard(game, 0, card.id);
  scheduleNext();
}

function humanKeepDrawn() {
  if (!game.awaitingDrawDecision) return;
  game.awaitingDrawDecision = null;
  passTurn(game);
  scheduleNext();
}

function humanNextRound() {
  if (game.phase !== 'round-over') return;
  startRound(game);
  scheduleNext();
}

function humanNewGame() {
  game = newGame();
  scheduleNext();
}

/* ------------------------------- Scheduler --------------------------------- */

function scheduleNext() {
  render();
  if (game.phase === 'round-over' || game.phase === 'game-over') return;
  if (game.phase === 'choose-color') {
    if (game.pendingWild.seat !== 0) setTimeout(aiColorStep, AI_DELAY);
    return;
  }
  if (game.phase === 'playing' && game.currentPlayer !== 0) {
    setTimeout(aiTurnStep, AI_DELAY);
  }
}

/* --------------------------------- Rendering -------------------------------- */

const TYPE_LABEL = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '★', wild4: '+4' };

function cardEl(card, { faceUp = true, disabled = false, onClick = null, small = false, pending = false } = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (small ? ' small' : '') + (disabled ? ' disabled' : '') + (pending ? ' pending' : '');
  if (!faceUp) {
    el.classList.add('card-back');
  } else {
    const colorClass = card.color ? `color-${card.color}` : 'color-wild';
    el.classList.add(colorClass);
    el.textContent = card.type === 'number' ? String(card.value) : TYPE_LABEL[card.type];
  }
  if (onClick && !disabled) {
    el.addEventListener('click', onClick);
    el.classList.add('clickable');
  }
  return el;
}

function render() {
  renderScores();
  renderSeats();
  renderCenter();
  renderControls();
  renderLog();
}

function renderScores() {
  const el = $('#scores');
  el.innerHTML = '';
  for (const s of SEATS) {
    const pill = document.createElement('div');
    pill.className = 'score-pill';
    pill.innerHTML = `<span>${SEAT_NAME[s]}</span><span>${game.scores[s]}</span>`;
    el.appendChild(pill);
  }
}

function renderSeats() {
  for (const seat of [1, 2, 3]) {
    const container = $(`#hand-${seat}`);
    container.innerHTML = '';
    for (let i = 0; i < game.hands[seat].length; i++) {
      container.appendChild(cardEl(null, { faceUp: false, small: true }));
    }
  }
  for (const seat of SEATS) {
    $(`#label-${seat}`).classList.toggle('active-turn',
      (game.phase === 'playing' && game.currentPlayer === seat) ||
      (game.phase === 'choose-color' && game.pendingWild && game.pendingWild.seat === seat));
  }

  const southContainer = $('#hand-0');
  southContainer.innerHTML = '';
  const canAct = game.phase === 'playing' && game.currentPlayer === 0 && !game.awaitingDrawDecision;
  for (const card of game.hands[0]) {
    const legal = canAct && isPlayable(game, card, game.hands[0]);
    const pending = !!(game.awaitingDrawDecision && game.awaitingDrawDecision.id === card.id);
    southContainer.appendChild(cardEl(card, {
      disabled: canAct && !legal,
      pending,
      onClick: legal ? () => humanPlay(card) : null,
    }));
  }
}

function renderCenter() {
  const drawEl = $('#draw-pile');
  drawEl.innerHTML = '';
  if (game.drawPile.length > 0) {
    const canDraw = game.phase === 'playing' && game.currentPlayer === 0 &&
      !game.awaitingDrawDecision && legalPlays(game, 0).length === 0;
    drawEl.appendChild(cardEl(null, { faceUp: false, onClick: canDraw ? humanDrawPile : null, disabled: !canDraw }));
  }

  const discardEl = $('#discard-pile');
  discardEl.innerHTML = '';
  const top = topCard(game);
  if (top) discardEl.appendChild(cardEl(top));

  const colorEl = $('#color-indicator');
  colorEl.innerHTML = '';
  if (game.currentColor) {
    const dot = document.createElement('span');
    dot.className = `color-dot color-${game.currentColor}`;
    colorEl.appendChild(dot);
    const label = document.createElement('span');
    label.textContent = COLOR_NAME[game.currentColor];
    colorEl.appendChild(label);
  }
}

function renderControls() {
  const el = $('#controls');
  el.innerHTML = '';

  if (game.phase === 'choose-color' && game.pendingWild && game.pendingWild.seat === 0) {
    el.appendChild(msg('Choose a color:'));
    const row = document.createElement('div');
    row.className = 'btn-row';
    for (const color of COLORS) {
      const b = document.createElement('button');
      b.className = 'color-btn';
      b.style.background = { R: '#e5453f', Y: '#f0c419', G: '#3fae51', B: '#3f7fe5' }[color];
      b.title = COLOR_NAME[color];
      b.addEventListener('click', () => humanChooseColor(color));
      row.appendChild(b);
    }
    el.appendChild(row);
  } else if (game.awaitingDrawDecision) {
    el.appendChild(msg(`You drew ${cardLabel(game.awaitingDrawDecision)} — play it or keep it?`));
    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(btn('Play it', humanPlayDrawn));
    row.appendChild(btn('Keep it', humanKeepDrawn));
    el.appendChild(row);
  } else if (game.phase === 'round-over') {
    el.appendChild(msg(`${SEAT_NAME[game.roundWinner]} won the round (+${game.roundPoints} points).`));
    el.appendChild(btn('Next Round', humanNextRound));
  } else if (game.phase === 'game-over') {
    el.appendChild(msg(`${SEAT_NAME[game.winner]} wins the game!`));
    el.appendChild(btn('New Game', humanNewGame));
  } else if (game.phase === 'playing') {
    if (game.currentPlayer === 0) {
      const hasLegal = legalPlays(game, 0).length > 0;
      el.appendChild(msg(hasLegal ? 'Your turn — play a card.' : 'No playable card — draw from the pile.'));
    } else {
      el.appendChild(msg(`Waiting for ${SEAT_NAME[game.currentPlayer]}...`));
    }
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

function renderLog() {
  const el = $('#log');
  el.innerHTML = game.log.slice(-40).map(l => `<div>${escapeHtml(l)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function boot() {
  scheduleNext();
  $('#new-game-btn').addEventListener('click', () => {
    if (confirm('Start a new game? Current scores will be lost.')) humanNewGame();
  });
}

document.addEventListener('DOMContentLoaded', boot);
