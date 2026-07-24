'use strict';

/* =========================================================================
   UNO — game engine + AI
   ========================================================================= */

const COLORS = ['R', 'Y', 'G', 'B'];
const COLOR_NAME = { R: 'Red', Y: 'Yellow', G: 'Green', B: 'Blue' };
const SEAT_NAME = { 0: 'You', 1: 'West', 2: 'North', 3: 'East' };
const SEATS = [0, 1, 2, 3];

let uid = 0;
function nextId() { return 'c' + (uid++); }

function makeDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, type: 'number', value: 0, id: nextId() });
    for (let v = 1; v <= 9; v++) {
      deck.push({ color, type: 'number', value: v, id: nextId() });
      deck.push({ color, type: 'number', value: v, id: nextId() });
    }
    for (let i = 0; i < 2; i++) {
      deck.push({ color, type: 'skip', id: nextId() });
      deck.push({ color, type: 'reverse', id: nextId() });
      deck.push({ color, type: 'draw2', id: nextId() });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: null, type: 'wild', id: nextId() });
    deck.push({ color: null, type: 'wild4', id: nextId() });
  }
  return deck;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardLabel(card) {
  const names = { skip: 'Skip', reverse: 'Reverse', draw2: '+2', wild: 'Wild', wild4: 'Wild +4' };
  if (card.type === 'number') return `${COLOR_NAME[card.color]} ${card.value}`;
  if (card.type === 'wild' || card.type === 'wild4') return names[card.type];
  return `${COLOR_NAME[card.color]} ${names[card.type]}`;
}

function cardPoints(card) {
  if (card.type === 'number') return card.value;
  if (card.type === 'wild' || card.type === 'wild4') return 50;
  return 20;
}

function newGame() {
  const game = {
    hands: [[], [], [], []],
    drawPile: [],
    discardPile: [],
    currentColor: null,
    currentPlayer: 0,
    direction: 1,
    phase: 'playing',      // playing | choose-color | round-over | game-over
    pendingWild: null,      // seat that must choose a color
    scores: [0, 0, 0, 0],
    roundNumber: 0,
    log: [],
    winner: null,
  };
  startRound(game);
  return game;
}

function log(game, msg) {
  game.log.push(msg);
  if (game.log.length > 300) game.log.shift();
}

function startRound(game) {
  game.roundNumber++;
  let deck = shuffle(makeDeck());
  game.hands = [[], [], [], []];
  for (let i = 0; i < 7; i++) for (const s of SEATS) game.hands[s].push(deck.pop());
  game.drawPile = deck;
  game.discardPile = [];
  game.direction = 1;
  game.phase = 'playing';
  game.pendingWild = null;

  // flip the first card, skipping any wilds back into the deck
  let first = game.drawPile.pop();
  const parked = [];
  while (first.type === 'wild' || first.type === 'wild4') {
    parked.push(first);
    first = game.drawPile.pop();
  }
  game.drawPile = shuffle(game.drawPile.concat(parked));
  game.discardPile.push(first);
  game.currentColor = first.color;
  game.currentPlayer = 0;
  log(game, `--- Round ${game.roundNumber}: starting card is ${cardLabel(first)} ---`);
  applyStartingCardEffect(game, first);
}

function applyStartingCardEffect(game, card) {
  if (card.type === 'reverse') { game.direction = -1; }
  else if (card.type === 'skip') { game.currentPlayer = nextSeat(game); log(game, `${SEAT_NAME[game.currentPlayer]} is skipped.`); game.currentPlayer = nextSeat(game); return; }
  else if (card.type === 'draw2') {
    drawCards(game, game.currentPlayer, 2);
    log(game, `${SEAT_NAME[game.currentPlayer]} draws 2 and is skipped.`);
    game.currentPlayer = nextSeat(game);
  }
}

function nextSeat(game, from) {
  const cur = from === undefined ? game.currentPlayer : from;
  return (cur + game.direction + 4) % 4;
}

function drawCards(game, seat, n) {
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (game.drawPile.length === 0) reshuffleDiscardIntoDraw(game);
    if (game.drawPile.length === 0) break;
    const c = game.drawPile.pop();
    game.hands[seat].push(c);
    drawn.push(c);
  }
  return drawn;
}

function reshuffleDiscardIntoDraw(game) {
  if (game.discardPile.length <= 1) return;
  const top = game.discardPile.pop();
  game.drawPile = shuffle(game.discardPile);
  game.discardPile = [top];
  log(game, 'Reshuffled discard pile into draw pile.');
}

function topCard(game) { return game.discardPile[game.discardPile.length - 1]; }

function isPlayable(game, card, hand) {
  const top = topCard(game);
  if (card.type === 'wild') return true;
  if (card.type === 'wild4') {
    // official rule: only legal if no card in hand matches the current color
    return !hand.some(c => c.id !== card.id && c.color === game.currentColor);
  }
  if (card.color === game.currentColor) return true;
  if (card.type === 'number') return top.type === 'number' && top.value === card.value;
  return top.type === card.type; // skip/reverse/draw2 match by type
}

function legalPlays(game, seat) {
  return game.hands[seat].filter(c => isPlayable(game, c, game.hands[seat]));
}

function removeCard(hand, cardId) {
  const i = hand.findIndex(c => c.id === cardId);
  if (i >= 0) hand.splice(i, 1);
  return i >= 0;
}

// Play `card` from `seat`'s hand. For wild cards, `chosenColor` must be supplied
// (or game.phase becomes 'choose-color' awaiting it).
function playCard(game, seat, cardId, chosenColor) {
  const hand = game.hands[seat];
  const card = hand.find(c => c.id === cardId);
  if (!card) return false;
  if (!isPlayable(game, card, hand)) return false;

  removeCard(hand, cardId);
  game.discardPile.push(card);
  log(game, `${SEAT_NAME[seat]} plays ${cardLabel(card)}`);

  if (hand.length === 1) log(game, `${SEAT_NAME[seat]} calls UNO!`);

  if (card.type === 'wild' || card.type === 'wild4') {
    if (!chosenColor) {
      game.pendingWild = { seat, card };
      game.phase = 'choose-color';
      return true;
    }
    finishWild(game, seat, card, chosenColor);
    return true;
  }

  game.currentColor = card.color;

  if (hand.length === 0) { endRound(game, seat); return true; }

  advanceTurn(game, card);
  return true;
}

function chooseColor(game, color) {
  if (game.phase !== 'choose-color' || !game.pendingWild) return;
  const { seat, card } = game.pendingWild;
  finishWild(game, seat, card, color);
}

function finishWild(game, seat, card, color) {
  game.currentColor = color;
  game.pendingWild = null;
  game.phase = 'playing';
  log(game, `${SEAT_NAME[seat]} names ${COLOR_NAME[color]}.`);
  if (game.hands[seat].length === 0) { endRound(game, seat); return; }
  advanceTurn(game, card);
}

function advanceTurn(game, justPlayed) {
  if (justPlayed.type === 'reverse') {
    game.direction *= -1;
    game.currentPlayer = nextSeat(game);
  } else if (justPlayed.type === 'skip') {
    const skipped = nextSeat(game);
    log(game, `${SEAT_NAME[skipped]} is skipped.`);
    game.currentPlayer = nextSeat(game, skipped);
  } else if (justPlayed.type === 'draw2') {
    const victim = nextSeat(game);
    drawCards(game, victim, 2);
    log(game, `${SEAT_NAME[victim]} draws 2 and is skipped.`);
    game.currentPlayer = nextSeat(game, victim);
  } else if (justPlayed.type === 'wild4') {
    const victim = nextSeat(game);
    drawCards(game, victim, 4);
    log(game, `${SEAT_NAME[victim]} draws 4 and is skipped.`);
    game.currentPlayer = nextSeat(game, victim);
  } else {
    game.currentPlayer = nextSeat(game);
  }
}

// Draw-and-maybe-play for a player with no legal move. Returns the drawn card.
function drawForTurn(game, seat) {
  const [drawn] = drawCards(game, seat, 1);
  if (!drawn) { game.currentPlayer = nextSeat(game); return null; }
  log(game, `${SEAT_NAME[seat]} draws a card.`);
  return drawn;
}

function passTurn(game) {
  game.currentPlayer = nextSeat(game);
}

function endRound(game, winnerSeat) {
  const points = SEATS.filter(s => s !== winnerSeat)
    .reduce((sum, s) => sum + game.hands[s].reduce((a, c) => a + cardPoints(c), 0), 0);
  game.scores[winnerSeat] += points;
  log(game, `${SEAT_NAME[winnerSeat]} wins the round! +${points} points.`);
  game.phase = 'round-over';
  game.roundWinner = winnerSeat;
  game.roundPoints = points;
  if (game.scores[winnerSeat] >= 500) {
    game.phase = 'game-over';
    game.winner = winnerSeat;
    log(game, `${SEAT_NAME[winnerSeat]} wins the game with ${game.scores[winnerSeat]} points!`);
  }
}

/* ----------------------------------- AI ------------------------------------ */

function aiChooseCard(game, seat) {
  const legal = legalPlays(game, seat);
  if (legal.length === 0) return null;
  const nonWild = legal.filter(c => c.type !== 'wild' && c.type !== 'wild4');
  const pool = nonWild.length > 0 ? nonWild : legal;
  const actionCards = pool.filter(c => c.type !== 'number');
  const chosen = actionCards.length > 0 ? actionCards[0] : pool[0];
  return chosen;
}

function aiChooseColor(game, seat) {
  const counts = { R: 0, Y: 0, G: 0, B: 0 };
  for (const c of game.hands[seat]) if (c.color) counts[c.color]++;
  let best = 'R', bestN = -1;
  for (const c of COLORS) if (counts[c] > bestN) { bestN = counts[c]; best = c; }
  return best;
}
