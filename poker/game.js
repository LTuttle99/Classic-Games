'use strict';

/* =========================================================================
   TEXAS HOLD'EM — game engine, hand evaluator, and AI
   Simplification: single main pot only (no side pots) — an all-in player
   who is under-covered is still eligible for the whole pot. Fine for a
   casual free-chip game; not casino-accurate for multi-way all-ins.
   ========================================================================= */

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = { S: 'black', C: 'black', H: 'red', D: 'red' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

const SEAT_NAME = { 0: 'You', 1: 'West', 2: 'North', 3: 'East' };
const SEATS = [0, 1, 2, 3];

const STARTING_STACK = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const BALANCE_KEY = 'poker-stacks';

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank, id: rank + suit });
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

function cardLabel(card) { return `${card.rank}${SUIT_SYMBOL[card.suit]}`; }

/* ------------------------------ Hand evaluator ------------------------------ */

const CATEGORY_NAME = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

function evaluate5(cards) {
  const values = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);
  const uniqueVals = [...new Set(values)];
  let straightHigh = null;
  if (uniqueVals.length === 5) {
    if (uniqueVals[0] - uniqueVals[4] === 4) straightHigh = uniqueVals[0];
    else if (uniqueVals[0] === 14 && uniqueVals[1] === 5 && uniqueVals[4] === 2) straightHigh = 5; // wheel A-2-3-4-5
  }
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ v: parseInt(v, 10), c }))
    .sort((a, b) => b.c - a.c || b.v - a.v);

  if (isFlush && straightHigh) {
    return { category: 8, tiebreak: [straightHigh], name: straightHigh === 14 ? 'Royal Flush' : 'Straight Flush' };
  }
  if (groups[0].c === 4) {
    return { category: 7, tiebreak: [groups[0].v, groups[1].v], name: 'Four of a Kind' };
  }
  if (groups[0].c === 3 && groups[1] && groups[1].c >= 2) {
    return { category: 6, tiebreak: [groups[0].v, groups[1].v], name: 'Full House' };
  }
  if (isFlush) {
    return { category: 5, tiebreak: values, name: 'Flush' };
  }
  if (straightHigh) {
    return { category: 4, tiebreak: [straightHigh], name: 'Straight' };
  }
  if (groups[0].c === 3) {
    return { category: 3, tiebreak: [groups[0].v, ...groups.slice(1).map(g => g.v)], name: 'Three of a Kind' };
  }
  if (groups[0].c === 2 && groups[1] && groups[1].c === 2) {
    const hi = Math.max(groups[0].v, groups[1].v), lo = Math.min(groups[0].v, groups[1].v);
    return { category: 2, tiebreak: [hi, lo, groups[2].v], name: 'Two Pair' };
  }
  if (groups[0].c === 2) {
    return { category: 1, tiebreak: [groups[0].v, ...groups.slice(1).map(g => g.v)], name: 'Pair' };
  }
  return { category: 0, tiebreak: values, name: 'High Card' };
}

function compareEval(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] || 0, bv = b.tiebreak[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function combinations(arr, k) {
  const results = [];
  (function helper(start, combo) {
    if (combo.length === k) { results.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); helper(i + 1, combo); combo.pop(); }
  })(0, []);
  return results;
}

function bestHand(cards) {
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const ev = evaluate5(combo);
    if (!best || compareEval(ev, best) > 0) { best = ev; best.cards = combo; }
  }
  return best;
}

function handDescription(ev) {
  const highRank = RANKS[ev.tiebreak[0] - 2];
  switch (ev.category) {
    case 8: return ev.name;
    case 7: return `Four of a Kind, ${highRank}s`;
    case 6: return `Full House, ${highRank}s over ${RANKS[ev.tiebreak[1] - 2]}s`;
    case 5: return 'Flush';
    case 4: return `Straight, ${highRank} high`;
    case 3: return `Three of a Kind, ${highRank}s`;
    case 2: return `Two Pair, ${highRank}s and ${RANKS[ev.tiebreak[1] - 2]}s`;
    case 1: return `Pair of ${highRank}s`;
    default: return `${highRank} High`;
  }
}

/* --------------------------------- Game state -------------------------------- */

function loadStacks() {
  try {
    const v = localStorage.getItem(BALANCE_KEY);
    if (v) {
      const arr = JSON.parse(v);
      if (Array.isArray(arr) && arr.length === 4 && arr.every(n => typeof n === 'number' && n >= 0)) return arr;
    }
  } catch (e) { /* ignore */ }
  return [STARTING_STACK, STARTING_STACK, STARTING_STACK, STARTING_STACK];
}

function saveStacks(game) {
  try { localStorage.setItem(BALANCE_KEY, JSON.stringify(game.players.map(p => p.stack))); } catch (e) { /* ignore */ }
}

function newGame() {
  const stacks = loadStacks();
  const game = {
    players: SEATS.map(s => ({
      seat: s, stack: stacks[s], holeCards: [], folded: false, allIn: false,
      currentBet: 0, hasActed: false, busted: stacks[s] <= 0,
    })),
    dealerSeat: 3, // so seat 0 posts small blind on the very first hand
    community: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    minRaise: BIG_BLIND,
    street: 'preflop',
    actingSeat: null,
    phase: 'hand-over',   // betting | hand-over | game-over
    handNumber: 0,
    log: [],
    showdown: null,
    winner: null,
  };
  return game;
}

function log(game, msg) {
  game.log.push(msg);
  if (game.log.length > 300) game.log.shift();
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function activeCount(game) { return game.players.filter(p => !p.busted).length; }

function nextSeatWithFlag(game, fromSeat, predicate) {
  let s = (fromSeat + 1) % 4;
  for (let i = 0; i < 4; i++) {
    if (predicate(game.players[s])) return s;
    s = (s + 1) % 4;
  }
  return null;
}

function nextOccupied(game, fromSeat) {
  return nextSeatWithFlag(game, fromSeat, p => !p.busted);
}

function nextToAct(game, fromSeat) {
  return nextSeatWithFlag(game, fromSeat, p => !p.busted && !p.folded && !p.allIn);
}

function startHand(game) {
  if (activeCount(game) < 2) {
    game.phase = 'game-over';
    game.winner = game.players.find(p => !p.busted);
    return;
  }
  game.handNumber++;
  game.deck = shuffle(makeDeck());
  game.community = [];
  game.pot = 0;
  game.currentBet = 0;
  game.minRaise = BIG_BLIND;
  game.street = 'preflop';
  game.showdown = null;

  for (const p of game.players) {
    if (p.busted) continue;
    p.holeCards = [];
    p.folded = false;
    p.allIn = false;
    p.currentBet = 0;
    p.hasActed = false;
  }

  game.dealerSeat = nextOccupied(game, game.dealerSeat);
  log(game, `--- Hand ${game.handNumber}: ${SEAT_NAME[game.dealerSeat]} is dealer ---`);

  // deal hole cards, two rounds starting left of dealer
  for (let round = 0; round < 2; round++) {
    let s = game.dealerSeat;
    for (let i = 0; i < 4; i++) {
      s = nextOccupied(game, s);
      game.players[s].holeCards.push(game.deck.pop());
    }
  }

  const sbSeat = nextOccupied(game, game.dealerSeat);
  const bbSeat = nextOccupied(game, sbSeat);
  postBlind(game, sbSeat, SMALL_BLIND, 'small blind');
  postBlind(game, bbSeat, BIG_BLIND, 'big blind');
  game.currentBet = BIG_BLIND;

  game.actingSeat = nextToAct(game, bbSeat);
  game.phase = 'betting';

  if (game.actingSeat === null) { runOutBoard(game); }
}

function postBlind(game, seat, amount, label) {
  const p = game.players[seat];
  const amt = Math.min(amount, p.stack);
  p.stack -= amt;
  p.currentBet += amt;
  game.pot += amt;
  if (p.stack === 0) p.allIn = true;
  log(game, `${SEAT_NAME[seat]} posts ${label} $${amt}`);
}

/* --------------------------------- Actions ----------------------------------- */

function amountToCall(game, seat) {
  return Math.max(0, game.currentBet - game.players[seat].currentBet);
}

function fold(game) {
  if (game.phase !== 'betting') return;
  const p = game.players[game.actingSeat];
  p.folded = true;
  p.hasActed = true;
  log(game, `${SEAT_NAME[p.seat]} folds`);
  afterAction(game);
}

function checkOrCall(game) {
  if (game.phase !== 'betting') return;
  const p = game.players[game.actingSeat];
  const toCall = amountToCall(game, p.seat);
  if (toCall <= 0) {
    log(game, `${SEAT_NAME[p.seat]} checks`);
  } else {
    const amt = Math.min(toCall, p.stack);
    p.stack -= amt;
    p.currentBet += amt;
    game.pot += amt;
    if (p.stack === 0) p.allIn = true;
    log(game, `${SEAT_NAME[p.seat]} calls $${amt}${p.allIn ? ' (all in)' : ''}`);
  }
  p.hasActed = true;
  afterAction(game);
}

// raiseTo = total chip level this player's currentBet should reach.
function betOrRaise(game, raiseTo) {
  if (game.phase !== 'betting') return false;
  const p = game.players[game.actingSeat];
  const cappedTo = Math.min(raiseTo, p.stack + p.currentBet);
  const addAmt = cappedTo - p.currentBet;
  if (addAmt <= 0) return false;

  p.stack -= addAmt;
  p.currentBet += addAmt;
  game.pot += addAmt;
  if (p.stack === 0) p.allIn = true;

  const isRaise = p.currentBet > game.currentBet;
  if (isRaise) {
    game.minRaise = Math.max(game.minRaise, p.currentBet - game.currentBet);
    game.currentBet = p.currentBet;
    for (const other of game.players) {
      if (other.seat !== p.seat && !other.busted && !other.folded && !other.allIn) other.hasActed = false;
    }
  }
  p.hasActed = true;
  log(game, `${SEAT_NAME[p.seat]} ${isRaise ? (game.pot === addAmt ? 'bets' : 'raises to') : 'calls'} $${p.currentBet}${p.allIn ? ' (all in)' : ''}`);
  afterAction(game);
  return true;
}

function bettingRoundComplete(game) {
  const contenders = game.players.filter(p => !p.busted && !p.folded && !p.allIn);
  if (contenders.length === 0) return true;
  return contenders.every(p => p.hasActed && p.currentBet === game.currentBet);
}

function afterAction(game) {
  const remaining = game.players.filter(p => !p.busted && !p.folded);
  if (remaining.length === 1) { awardUncontested(game, remaining[0]); return; }

  if (bettingRoundComplete(game)) { advanceStreet(game); return; }

  const next = nextToAct(game, game.actingSeat);
  if (next === null) { runOutBoard(game); return; }
  game.actingSeat = next;
}

function advanceStreet(game) {
  if (game.street === 'river') { goToShowdown(game); return; }

  for (const p of game.players) { if (!p.busted) { p.currentBet = 0; p.hasActed = false; } }
  game.currentBet = 0;
  game.minRaise = BIG_BLIND;

  if (game.street === 'preflop') { dealCommunity(game, 3); game.street = 'flop'; }
  else if (game.street === 'flop') { dealCommunity(game, 1); game.street = 'turn'; }
  else if (game.street === 'turn') { dealCommunity(game, 1); game.street = 'river'; }

  log(game, `--- ${game.street.toUpperCase()}: ${game.community.map(cardLabel).join(' ')} ---`);

  const remaining = game.players.filter(p => !p.busted && !p.folded);
  if (remaining.length === 1) { awardUncontested(game, remaining[0]); return; }

  const next = nextToAct(game, game.dealerSeat);
  if (next === null) { runOutBoard(game); return; }
  game.actingSeat = next;
}

function dealCommunity(game, n) {
  for (let i = 0; i < n; i++) game.community.push(game.deck.pop());
}

function runOutBoard(game) {
  game.actingSeat = null;
  while (game.street !== 'river') {
    if (game.street === 'preflop') { dealCommunity(game, 3); game.street = 'flop'; }
    else if (game.street === 'flop') { dealCommunity(game, 1); game.street = 'turn'; }
    else if (game.street === 'turn') { dealCommunity(game, 1); game.street = 'river'; }
  }
  log(game, `Board runs out: ${game.community.map(cardLabel).join(' ')}`);
  const remaining = game.players.filter(p => !p.busted && !p.folded);
  if (remaining.length === 1) { awardUncontested(game, remaining[0]); return; }
  goToShowdown(game);
}

function awardUncontested(game, winner) {
  winner.stack += game.pot;
  log(game, `${SEAT_NAME[winner.seat]} wins $${game.pot} (everyone else folded)`);
  game.pot = 0;
  game.phase = 'hand-over';
  game.actingSeat = null;
  finishHandBookkeeping(game);
}

function goToShowdown(game) {
  const contenders = game.players.filter(p => !p.busted && !p.folded);
  const results = contenders.map(p => {
    const ev = bestHand(p.holeCards.concat(game.community));
    return { seat: p.seat, ev, desc: handDescription(ev) };
  });
  results.sort((a, b) => compareEval(b.ev, a.ev));
  const best = results[0].ev;
  const winners = results.filter(r => compareEval(r.ev, best) === 0);
  const share = Math.floor(game.pot / winners.length);
  let remainder = game.pot - share * winners.length;
  for (const w of winners) {
    const p = game.players[w.seat];
    let amt = share;
    if (remainder > 0) { amt += 1; remainder--; }
    p.stack += amt;
  }
  for (const r of results) log(game, `${SEAT_NAME[r.seat]} shows ${r.desc}`);
  log(game, winners.length > 1
    ? `Split pot between ${winners.map(w => SEAT_NAME[w.seat]).join(' & ')}`
    : `${SEAT_NAME[winners[0].seat]} wins $${game.pot} with ${winners[0].desc}`);
  game.pot = 0;
  game.phase = 'hand-over';
  game.actingSeat = null;
  game.showdown = { results, winners: winners.map(w => w.seat) };
  finishHandBookkeeping(game);
}

function finishHandBookkeeping(game) {
  for (const p of game.players) { if (!p.busted && p.stack <= 0) { p.busted = true; log(game, `${SEAT_NAME[p.seat]} is out of chips.`); } }
  saveStacks(game);
  if (activeCount(game) < 2) {
    game.phase = 'game-over';
    game.winner = game.players.find(p => !p.busted);
    log(game, `${SEAT_NAME[game.winner.seat]} wins the table!`);
  }
}

function nextHand(game) {
  if (game.phase !== 'hand-over') return;
  startHand(game);
}

function resetStacks(game) {
  for (const p of game.players) { p.stack = STARTING_STACK; p.busted = false; }
  saveStacks(game);
  game.dealerSeat = 3;
  game.phase = 'hand-over';
  game.winner = null;
  game.pot = 0;
  game.community = [];
  for (const p of game.players) { p.holeCards = []; p.folded = false; p.allIn = false; p.currentBet = 0; }
  log(game, 'Stacks reset — new game.');
}

/* ----------------------------------- AI ------------------------------------ */

function preflopScore(hole) {
  const v1 = RANK_VALUE[hole[0].rank], v2 = RANK_VALUE[hole[1].rank];
  const hi = Math.max(v1, v2), lo = Math.min(v1, v2);
  let score = hi;
  if (v1 === v2) score += 10 + hi;
  if (hole[0].suit === hole[1].suit) score += 3;
  if (v1 !== v2) {
    const gap = hi - lo;
    if (gap === 1) score += 2;
    else if (gap === 2) score += 1;
    else if (gap >= 5) score -= 2;
  }
  return score; // roughly 2..38
}

function handStrength(game, seat) {
  const p = game.players[seat];
  if (game.community.length === 0) {
    return clamp((preflopScore(p.holeCards) - 4) / 34, 0, 1);
  }
  const best = bestHand(p.holeCards.concat(game.community));
  let s = best.category / 8;
  if (best.category === 0) s += (best.tiebreak[0] - 2) / 12 * 0.12;
  else if (best.category === 1) s += (best.tiebreak[0] - 2) / 12 * 0.08;
  return clamp(s, 0, 1);
}

function aiAct(game, seat) {
  const p = game.players[seat];
  const toCall = amountToCall(game, seat);
  const strength = handStrength(game, seat);
  const noise = (Math.random() - 0.5) * 0.28;
  const aggression = strength + noise;
  const potOddsOK = p.stack > 0 && toCall > 0 && toCall <= Math.max(20, p.stack * 0.07);

  if (toCall === 0) {
    if (aggression > 0.6 && p.stack > 0) {
      const size = Math.max(game.minRaise, Math.round(game.pot * (0.5 + Math.random() * 0.6)));
      betOrRaise(game, p.currentBet + Math.min(size, p.stack));
    } else {
      checkOrCall(game);
    }
    return;
  }

  if (aggression < 0.26 && !potOddsOK) {
    fold(game);
  } else if (aggression > 0.78 && p.stack > toCall) {
    const raiseAdd = Math.max(game.minRaise, Math.round(game.pot * 0.7));
    betOrRaise(game, game.currentBet + Math.min(raiseAdd, p.stack - toCall));
  } else {
    checkOrCall(game);
  }
}
