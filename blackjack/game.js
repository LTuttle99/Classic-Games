'use strict';

/* =========================================================================
   BLACKJACK — game engine
   ========================================================================= */

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = { S: 'black', C: 'black', H: 'red', D: 'red' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const STARTING_BANKROLL = 1000;
const BALANCE_KEY = 'blackjack-balance';

function makeShoe(numDecks) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank, id: `${rank}${suit}-${d}` });
  }
  return shuffle(deck);
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

function cardValue(rank) {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return parseInt(rank, 10);
}

// Best total <= 21 if possible (soft-ace handling), plus whether it's "soft".
function handTotal(cards) {
  let total = cards.reduce((sum, c) => sum + cardValue(c.rank), 0);
  let aces = cards.filter(c => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const soft = aces > 0 && total <= 21;
  return { total, soft, bust: total > 21, blackjack: cards.length === 2 && total === 21 };
}

function loadBalance() {
  try {
    const v = localStorage.getItem(BALANCE_KEY);
    if (v !== null) {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch (e) { /* localStorage unavailable — fall through */ }
  return STARTING_BANKROLL;
}

function saveBalance(balance) {
  try { localStorage.setItem(BALANCE_KEY, String(balance)); } catch (e) { /* ignore */ }
}

function newGame() {
  return {
    balance: loadBalance(),
    bet: 0,
    shoe: makeShoe(4),
    player: [],
    dealer: [],
    phase: 'betting',   // betting | player-turn | dealer-turn | hand-over
    outcome: null,       // 'win' | 'lose' | 'push' | 'blackjack'
    doubled: false,
    log: [],
  };
}

function log(game, msg) {
  game.log.push(msg);
  if (game.log.length > 200) game.log.shift();
}

function draw(game) {
  if (game.shoe.length < 15) game.shoe = makeShoe(4); // reshuffle before running low
  return game.shoe.shift();
}

function placeBet(game, amount) {
  if (game.phase !== 'betting') return;
  const add = Math.min(amount, game.balance - game.bet);
  if (add <= 0) return;
  game.bet += add;
}

function clearBet(game) {
  if (game.phase !== 'betting') return;
  game.bet = 0;
}

function deal(game) {
  if (game.phase !== 'betting' || game.bet <= 0) return;
  game.balance -= game.bet;
  saveBalance(game.balance);
  game.player = [draw(game), draw(game)];
  game.dealer = [draw(game), draw(game)];
  game.doubled = false;
  game.outcome = null;
  log(game, `You bet $${game.bet}. Dealt ${cardLabel(game.player[0])} ${cardLabel(game.player[1])} vs dealer's ${cardLabel(game.dealer[0])} and a hidden card.`);

  const playerBJ = handTotal(game.player).blackjack;
  const dealerBJ = handTotal(game.dealer).blackjack;
  if (playerBJ || dealerBJ) {
    game.phase = 'dealer-turn';
    resolveDealer(game);
    return;
  }
  game.phase = 'player-turn';
}

function hit(game) {
  if (game.phase !== 'player-turn') return;
  game.player.push(draw(game));
  const t = handTotal(game.player);
  log(game, `You draw ${cardLabel(game.player[game.player.length - 1])} (total ${t.total}${t.soft ? ' soft' : ''})`);
  if (t.bust) {
    game.phase = 'hand-over';
    game.outcome = 'lose';
    log(game, `You bust with ${t.total}.`);
    finishHand(game);
  }
}

function stand(game) {
  if (game.phase !== 'player-turn') return;
  game.phase = 'dealer-turn';
  resolveDealer(game);
}

function double(game) {
  if (game.phase !== 'player-turn' || game.player.length !== 2) return;
  if (game.balance < game.bet) return; // can't cover the extra stake
  game.balance -= game.bet;
  saveBalance(game.balance);
  game.bet *= 2;
  game.doubled = true;
  game.player.push(draw(game));
  const t = handTotal(game.player);
  log(game, `You double down, draw ${cardLabel(game.player[game.player.length - 1])} (total ${t.total})`);
  if (t.bust) {
    game.phase = 'hand-over';
    game.outcome = 'lose';
    log(game, `You bust with ${t.total}.`);
    finishHand(game);
  } else {
    game.phase = 'dealer-turn';
    resolveDealer(game);
  }
}

function resolveDealer(game) {
  const pt = handTotal(game.player);
  const playerBJ = pt.blackjack;

  if (!pt.bust) {
    log(game, `Dealer reveals ${cardLabel(game.dealer[1])}.`);
    while (true) {
      const dt = handTotal(game.dealer);
      if (dt.total >= 17 || dt.bust) break;
      game.dealer.push(draw(game));
      log(game, `Dealer draws ${cardLabel(game.dealer[game.dealer.length - 1])}`);
    }
  }

  const dt = handTotal(game.dealer);
  const dealerBJ = dt.blackjack;

  if (playerBJ && dealerBJ) { game.outcome = 'push'; log(game, 'Both have blackjack — push.'); }
  else if (playerBJ) { game.outcome = 'blackjack'; log(game, 'Blackjack! You win 3:2.'); }
  else if (dealerBJ) { game.outcome = 'lose'; log(game, 'Dealer has blackjack.'); }
  else if (dt.bust) { game.outcome = 'win'; log(game, `Dealer busts with ${dt.total}. You win!`); }
  else if (dt.total > pt.total) { game.outcome = 'lose'; log(game, `Dealer ${dt.total} beats your ${pt.total}.`); }
  else if (dt.total < pt.total) { game.outcome = 'win'; log(game, `You win, ${pt.total} beats dealer's ${dt.total}.`); }
  else { game.outcome = 'push'; log(game, `Push at ${pt.total}.`); }

  game.phase = 'hand-over';
  finishHand(game);
}

function finishHand(game) {
  let payout = 0;
  if (game.outcome === 'blackjack') payout = game.bet + Math.floor(game.bet * 1.5);
  else if (game.outcome === 'win') payout = game.bet * 2;
  else if (game.outcome === 'push') payout = game.bet;
  else payout = 0;
  if (payout > 0) {
    game.balance += payout;
    saveBalance(game.balance);
  }
  game.lastPayout = payout;
}

function nextHand(game) {
  game.bet = 0;
  game.player = [];
  game.dealer = [];
  game.outcome = null;
  game.doubled = false;
  game.phase = 'betting';
}

function resetBankroll(game) {
  game.balance = STARTING_BANKROLL;
  saveBalance(game.balance);
  nextHand(game);
  log(game, 'Bankroll reset.');
}
