'use strict';

/* =========================================================================
   EUCHRE — game engine + AI + UI wiring
   Single-file vanilla JS. No build step, no dependencies.
   ========================================================================= */

/* ---------------------------- Constants -------------------------------- */

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const SUIT_COLOR = { S: 'black', C: 'black', H: 'red', D: 'red' };
const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];
const RANK_ORDER = { '9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5 };

// Seats: 0 = You (South), 1 = Left opp (West), 2 = Partner (North), 3 = Right opp (East)
const SEATS = [0, 1, 2, 3];
const SEAT_NAME = { 0: 'You', 1: 'West', 2: 'Partner', 3: 'East' };
const TEAM_OF = { 0: 0, 2: 0, 1: 1, 3: 1 };
const PARTNER_OF = { 0: 2, 2: 0, 1: 3, 3: 1 };

function otherSuitOfColor(suit) {
  const color = SUIT_COLOR[suit];
  return SUITS.find(s => s !== suit && SUIT_COLOR[s] === color);
}

function cardId(suit, rank) { return rank + suit; }

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: cardId(suit, rank) });
    }
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

/* --------------------------- Card semantics ----------------------------- */

// The "effective suit" of a card given trump (left bower belongs to trump suit).
function effectiveSuit(card, trump) {
  if (trump && card.rank === 'J' && card.suit === otherSuitOfColor(trump)) return trump;
  return card.suit;
}

function isTrump(card, trump) {
  if (!trump) return false;
  return effectiveSuit(card, trump) === trump;
}

function isRightBower(card, trump) { return trump && card.rank === 'J' && card.suit === trump; }
function isLeftBower(card, trump) { return trump && card.rank === 'J' && card.suit === otherSuitOfColor(trump); }

// Numeric strength for comparing two cards that are of the SAME effective suit context.
// Higher = better. Works for trump cards and for plain-suit cards.
function cardStrength(card, trump) {
  if (isTrump(card, trump)) {
    if (isRightBower(card, trump)) return 100;
    if (isLeftBower(card, trump)) return 90;
    return 50 + RANK_ORDER[card.rank]; // A=55 K=54 Q=53 10=51 9=50
  }
  return RANK_ORDER[card.rank]; // plain suit ranking, no jacks-are-special here
}

/* ------------------------------ Game state ------------------------------ */

function newGame() {
  return {
    scores: [0, 0],           // [yourTeam, oppTeam]
    dealer: 3,                // East deals first hand -> You bid first
    hands: [[], [], [], []],
    kitty: [],
    upCard: null,
    upCardTaken: false,
    trump: null,
    turnedDownSuit: null,
    maker: null,               // seat that called trump
    makerTeam: null,
    alone: false,
    sittingOut: null,          // seat sitting out if alone
    phase: 'deal',             // deal | bid1 | bid1-discard | bid2 | play | hand-over | game-over
    biddingTurn: null,
    tricks: [],                // completed tricks: {cards:[{seat,card}], winner, ledSuit}
    currentTrick: [],          // {seat, card}[]
    awaitingClear: false,      // true right after a trick completes, before UI clears it
    trickLeader: null,
    turn: null,
    trickWins: [0, 0, 0, 0],   // tricks won per seat
    log: [],
    handNumber: 0,
  };
}

function log(game, msg) {
  game.log.push(msg);
  if (game.log.length > 200) game.log.shift();
}

function leftOf(seat) { return (seat + 1) % 4; }

function activeSeats(game) {
  return SEATS.filter(s => s !== game.sittingOut);
}

function nextActiveSeat(game, seat) {
  let s = leftOf(seat);
  while (s === game.sittingOut) s = leftOf(s);
  return s;
}

/* --------------------------------- Deal ---------------------------------- */

function startHand(game) {
  game.handNumber++;
  const deck = shuffle(makeDeck());
  game.hands = [[], [], [], []];
  // deal 3-2-3-2 pattern per player just like a real deal (order doesn't matter functionally)
  const pattern = [3, 2, 3, 2];
  let idx = 0;
  for (let round = 0; round < 2; round++) {
    for (const seat of SEATS) {
      const n = round === 0 ? pattern[seat] : (5 - pattern[seat]);
      for (let i = 0; i < n; i++) game.hands[seat].push(deck[idx++]);
    }
  }
  game.kitty = deck.slice(idx, idx + 4);
  game.upCard = game.kitty[0];
  game.upCardTaken = false;
  game.trump = null;
  game.turnedDownSuit = null;
  game.maker = null;
  game.makerTeam = null;
  game.alone = false;
  game.sittingOut = null;
  game.tricks = [];
  game.currentTrick = [];
  game.awaitingClear = false;
  game.trickWins = [0, 0, 0, 0];
  game.phase = 'bid1';
  game.biddingTurn = leftOf(game.dealer);
  log(game, `--- Hand ${game.handNumber}: ${subj(game.dealer)} ${verbFor(game.dealer, 'deal', 'deals')}. Up card: ${cardLabel(game.upCard)} ---`);
}

function cardLabel(card) {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function possessive(seat) {
  return seat === 0 ? 'Your' : `${SEAT_NAME[seat]}'s`;
}

// You order / West orders — simple subject+verb agreement for the log feed.
function subj(seat) { return SEAT_NAME[seat]; }
function verbFor(seat, base, thirdPerson) { return seat === 0 ? base : thirdPerson; }

/* -------------------------------- Bidding -------------------------------- */

function sortHand(hand, trump) {
  hand.sort((a, b) => {
    const as = effectiveSuit(a, trump), bs = effectiveSuit(b, trump);
    if (as !== bs) {
      // group trump first, then by suit letter for stability
      if (trump) { if (as === trump && bs !== trump) return -1; if (bs === trump && as !== trump) return 1; }
      return as.localeCompare(bs);
    }
    return cardStrength(b, trump) - cardStrength(a, trump);
  });
  return hand;
}

// Evaluate how good `suit` would be as trump for `hand` (array of cards), optionally
// simulating the dealer picking up `extraCard` and discarding their worst card.
function evaluateSuit(hand, suit, extraCard) {
  let cards = hand.slice();
  if (extraCard) cards = cards.concat([extraCard]);
  let score = 0;
  let trumpCount = 0;
  let hasRight = false, hasLeft = false;
  const offAces = [];
  for (const c of cards) {
    if (isTrump(c, suit)) {
      trumpCount++;
      if (isRightBower(c, suit)) { score += 40; hasRight = true; }
      else if (isLeftBower(c, suit)) { score += 33; hasLeft = true; }
      else if (c.rank === 'A') score += 22;
      else if (c.rank === 'K') score += 18;
      else if (c.rank === 'Q') score += 15;
      else if (c.rank === '10') score += 11;
      else score += 8; // 9
    } else if (c.rank === 'A') {
      offAces.push(c);
      score += 9;
    } else if (c.rank === 'K') {
      score += 3;
    }
  }
  if (trumpCount >= 3) score += 10;
  if (trumpCount >= 4) score += 15;
  if (hasRight && hasLeft) score += 10;
  return { score, trumpCount, hasRight, hasLeft, offAceCount: offAces.length };
}

function bestDiscard(hand, trump) {
  // pick the worst card to discard (lowest strength, prefer non-trump)
  let worst = null, worstVal = Infinity;
  for (const c of hand) {
    const trumpish = isTrump(c, trump) ? 1000 : 0;
    const val = trumpish + cardStrength(c, trump);
    if (val < worstVal) { worstVal = val; worst = c; }
  }
  return worst;
}

function removeCard(hand, card) {
  const i = hand.findIndex(c => c.id === card.id);
  if (i >= 0) hand.splice(i, 1);
  return i >= 0;
}

/* AI decision: round 1 (order it up / pass), returns {action:'order'|'pass', alone} */
function aiDecideOrderUp(game, seat) {
  const hand = game.hands[seat];
  const suit = game.upCard.suit;
  const isDealer = seat === game.dealer;
  const evalResult = evaluateSuit(hand, suit, isDealer ? game.upCard : null);
  const partnerIsDealer = PARTNER_OF[seat] === game.dealer;
  let threshold = 62;
  if (isDealer) threshold = 52; // free card
  if (partnerIsDealer) threshold = 58; // dealer's discard helps partner's team
  if (evalResult.score >= threshold) {
    const alone = evalResult.score >= 95 && evalResult.trumpCount >= 4;
    return { action: 'order', alone };
  }
  return { action: 'pass' };
}

/* AI decision: round 2 (call suit or pass), returns {action:'call'|'pass', suit, alone} */
function aiDecideCallSuit(game, seat) {
  const hand = game.hands[seat];
  const forbidden = game.upCard.suit;
  const isDealer = seat === game.dealer;
  const isLastToAct = isDealer; // stick the dealer handled by caller
  let best = null;
  for (const suit of SUITS) {
    if (suit === forbidden) continue;
    const r = evaluateSuit(hand, suit, null);
    if (!best || r.score > best.score) best = { suit, ...r };
  }
  const threshold = 58;
  if (best && best.score >= threshold) {
    const alone = best.score >= 95 && best.trumpCount >= 4;
    return { action: 'call', suit: best.suit, alone };
  }
  return { action: 'pass', bestSuit: best ? best.suit : null };
}

function setTrumpAndMaker(game, trump, maker, alone) {
  game.trump = trump;
  game.maker = maker;
  game.makerTeam = TEAM_OF[maker];
  game.alone = alone;
  game.sittingOut = alone ? PARTNER_OF[maker] : null;
  for (const s of SEATS) sortHand(game.hands[s], trump);
}

function beginPlay(game) {
  game.phase = 'play';
  game.trickLeader = nextActiveSeat(game, game.dealer);
  game.turn = game.trickLeader;
  game.currentTrick = [];
}

/* ---------------------------------- Play ---------------------------------- */

function legalPlays(hand, trick, trump) {
  if (trick.length === 0) return hand.slice();
  const ledSuit = effectiveSuit(trick[0].card, trump);
  const followers = hand.filter(c => effectiveSuit(c, trump) === ledSuit);
  return followers.length > 0 ? followers : hand.slice();
}

function trickWinner(trick, trump) {
  const ledSuit = effectiveSuit(trick[0].card, trump);
  let best = trick[0];
  for (let i = 1; i < trick.length; i++) {
    const t = trick[i];
    const tIsTrump = isTrump(t.card, trump);
    const bIsTrump = isTrump(best.card, trump);
    if (tIsTrump && !bIsTrump) { best = t; continue; }
    if (!tIsTrump && bIsTrump) continue;
    if (tIsTrump && bIsTrump) {
      if (cardStrength(t.card, trump) > cardStrength(best.card, trump)) best = t;
      continue;
    }
    // neither trump: only cards of led suit can win
    if (effectiveSuit(t.card, trump) === ledSuit && cardStrength(t.card, trump) > cardStrength(best.card, trump)) {
      best = t;
    }
  }
  return best.seat;
}

function playCard(game, seat, card) {
  const hand = game.hands[seat];
  if (!removeCard(hand, card)) throw new Error('card not in hand');
  game.currentTrick.push({ seat, card });
  log(game, `${subj(seat)} ${verbFor(seat, 'play', 'plays')} ${cardLabel(card)}`);

  if (game.currentTrick.length === activeSeats(game).length) {
    // trick complete — leave the cards visible; UI clears them after a beat
    const winner = trickWinner(game.currentTrick, game.trump);
    game.trickWins[winner]++;
    game.tricks.push({ cards: game.currentTrick, winner });
    log(game, `${subj(winner)} ${verbFor(winner, 'win', 'wins')} the trick`);
    game.trickLeader = winner;
    game.turn = winner;
    game.awaitingClear = true;
    if (game.tricks.length === 5) {
      scoreHand(game);
      return;
    }
  } else {
    game.turn = nextActiveSeat(game, seat);
  }
}

/* --------------------------------- AI play -------------------------------- */

function aiChooseCard(game, seat) {
  const hand = game.hands[seat];
  const trick = game.currentTrick;
  const trump = game.trump;
  const legal = legalPlays(hand, trick, trump);

  if (trick.length === 0) {
    return chooseLead(game, seat, hand, trump);
  }

  const partnerSeat = PARTNER_OF[seat];
  const partnerInTrick = trick.some(t => t.seat === partnerSeat);
  const partnerWinning = partnerInTrick && trickWinner(trick, trump) === partnerSeat;
  const isLastPlayer = trick.length === activeSeats(game).length - 1;

  // cards that would win if played now
  const winners = legal.filter(c => trickWinner(trick.concat([{ seat, card: c }]), trump) === seat);

  if (partnerWinning && !isLastPlayer) {
    // duck: play lowest card, save winners
    return lowestCard(legal, trump);
  }

  if (winners.length > 0) {
    if (partnerWinning && isLastPlayer) {
      // partner already winning as last play, just throw low
      return lowestCard(legal, trump);
    }
    // win as cheaply as possible
    return winners.reduce((a, b) => cardStrength(a, trump) < cardStrength(b, trump) ? a : b);
  }

  // can't win: throw lowest, prefer shedding off-suit non-aces
  return lowestCard(legal, trump);
}

function lowestCard(cards, trump) {
  return cards.reduce((a, b) => {
    const av = isTrump(a, trump) ? 100 + cardStrength(a, trump) : cardStrength(a, trump);
    const bv = isTrump(b, trump) ? 100 + cardStrength(b, trump) : cardStrength(b, trump);
    return av <= bv ? a : b;
  });
}

function chooseLead(game, seat, hand, trump) {
  const trumps = hand.filter(c => isTrump(c, trump));
  const nonTrump = hand.filter(c => !isTrump(c, trump));

  // lead a guaranteed-winner off-ace if we have one
  const offAces = nonTrump.filter(c => c.rank === 'A');
  if (offAces.length > 0) return offAces[0];

  // if we hold the right or left bower, or 3+ trump, lead trump to draw it out
  const hasBower = trumps.some(c => isRightBower(c, trump) || isLeftBower(c, trump));
  if (hasBower || trumps.length >= 3) {
    return trumps.reduce((a, b) => cardStrength(a, trump) > cardStrength(b, trump) ? a : b);
  }

  if (nonTrump.length > 0) return lowestCard(nonTrump, trump);
  return lowestCard(hand, trump);
}

/* -------------------------------- Scoring --------------------------------- */

function scoreHand(game) {
  game.phase = 'hand-over';
  const makerTeam = game.makerTeam;
  const defTeam = 1 - makerTeam;
  const makerTricks = SEATS.filter(s => TEAM_OF[s] === makerTeam).reduce((sum, s) => sum + game.trickWins[s], 0);

  let points = 0, winningTeam;
  if (makerTricks >= 3) {
    winningTeam = makerTeam;
    if (makerTricks === 5) points = game.alone ? 4 : 2;
    else points = 1;
    log(game, `${possessive(game.maker)} team took ${makerTricks} tricks: +${points} point${points === 1 ? '' : 's'}`);
  } else {
    winningTeam = defTeam;
    points = 2;
    log(game, `${possessive(game.maker)} team was EUCHRED (only ${makerTricks} tricks): opponents +2 points`);
  }
  game.scores[winningTeam] += points;
  game.lastHandSummary = { makerTeam, makerTricks, points, winningTeam };

  if (game.scores[0] >= 10 || game.scores[1] >= 10) {
    game.phase = 'game-over';
    log(game, game.scores[0] >= 10 ? 'You and your partner WIN THE GAME!' : 'West/East win the game.');
  }
}

function advanceHand(game) {
  game.dealer = leftOf(game.dealer);
  startHand(game);
}
