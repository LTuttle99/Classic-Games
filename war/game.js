'use strict';

/* =========================================================================
   WAR — game engine
   ========================================================================= */

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = { S: 'black', C: 'black', H: 'red', D: 'red' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i]));

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

function newGame() {
  const deck = shuffle(makeDeck());
  const mid = Math.ceil(deck.length / 2);
  return {
    player: deck.slice(0, mid),     // front of array = top of deck
    cpu: deck.slice(mid),
    table: [],                       // cards currently face up/down on the table this round
    log: [],
    round: 0,
    warDepth: 0,                     // 0 = normal flip, >0 = mid-war
    gameOver: false,
    winner: null,
  };
}

function log(game, msg) {
  game.log.push(msg);
  if (game.log.length > 300) game.log.shift();
}

function cardLabel(card) {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

// Plays one flip (or one war escalation). Mutates game in place.
// Returns a description of what happened for the UI to animate/react to, via game.lastResult.
function playRound(game) {
  if (game.gameOver) return;

  if (game.warDepth === 0) {
    if (game.player.length === 0 || game.cpu.length === 0) {
      finishGame(game);
      return;
    }
    game.round++;
    const p = game.player.shift();
    const c = game.cpu.shift();
    game.table.push({ owner: 'player', card: p, faceUp: true });
    game.table.push({ owner: 'cpu', card: c, faceUp: true });
    log(game, `Round ${game.round}: you flip ${cardLabel(p)}, opponent flips ${cardLabel(c)}`);
    resolveFlip(game, p, c);
  } else {
    // continuing a war: each side burns up to 3 face-down, then 1 face-up
    const pStake = drawStake(game, 'player');
    const cStake = drawStake(game, 'cpu');
    game.table.push(...pStake, ...cStake);

    const pUp = pStake.filter(x => x.faceUp)[0];
    const cUp = cStake.filter(x => x.faceUp)[0];

    if (!pUp || !cUp) {
      // one side ran out of cards entirely mid-war — the other side takes everything
      finishGame(game);
      return;
    }
    log(game, `War! You show ${cardLabel(pUp.card)}, opponent shows ${cardLabel(cUp.card)}`);
    resolveFlip(game, pUp.card, cUp.card);
  }
}

function drawStake(game, owner) {
  const deck = game[owner];
  const stake = [];
  const faceDownCount = Math.min(3, Math.max(0, deck.length - 1));
  for (let i = 0; i < faceDownCount; i++) {
    stake.push({ owner, card: deck.shift(), faceUp: false });
  }
  if (deck.length > 0) {
    stake.push({ owner, card: deck.shift(), faceUp: true });
  }
  return stake;
}

function resolveFlip(game, pCard, cCard) {
  const pv = RANK_VALUE[pCard.rank], cv = RANK_VALUE[cCard.rank];
  if (pv > cv) {
    awardTable(game, 'player');
  } else if (cv > pv) {
    awardTable(game, 'cpu');
  } else {
    log(game, `Tie on ${pCard.rank}s — war!`);
    game.warDepth++;
    if (game.player.length === 0 || game.cpu.length === 0) {
      finishGame(game);
    }
  }
}

function awardTable(game, owner) {
  const winnerName = owner === 'player' ? 'You' : 'Opponent';
  log(game, `${winnerName} win${owner === 'player' ? '' : 's'} ${game.table.length} card${game.table.length === 1 ? '' : 's'}`);
  const cards = shuffle(game.table.map(t => t.card));
  game[owner].push(...cards);
  game.table = [];
  game.warDepth = 0;

  if (game.player.length === 0 || game.cpu.length === 0) {
    finishGame(game);
  }
}

function finishGame(game) {
  // whoever still has cards (after awarding the table, if any) wins
  const cards = shuffle(game.table.map(t => t.card));
  if (cards.length > 0) {
    if (game.player.length >= game.cpu.length) game.player.push(...cards);
    else game.cpu.push(...cards);
    game.table = [];
  }
  game.gameOver = true;
  game.winner = game.player.length > game.cpu.length ? 'player' : 'cpu';
  log(game, game.winner === 'player' ? 'You win the whole deck! 🎉' : 'Opponent wins the whole deck.');
}
