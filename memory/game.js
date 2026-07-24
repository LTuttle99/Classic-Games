'use strict';

/* =========================================================================
   MEMORY / CONCENTRATION
   ========================================================================= */

const SYMBOL_POOL = ['🍎', '🍌', '🍇', '🍉', '🍒', '🍋', '🥝', '🍑', '🍍', '🥥', '🍓', '🫐', '🍊', '🍐', '🥭', '🍈', '🌽', '🍆'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGame(pairCount) {
  const symbols = shuffle(SYMBOL_POOL).slice(0, pairCount);
  const deck = shuffle(symbols.concat(symbols)).map((symbol, i) => ({
    id: i, symbol, matched: false, flipped: false,
  }));
  return {
    pairCount,
    cards: deck,
    pending: null,     // index of first flipped card awaiting a second
    locked: false,      // true while a mismatched pair is shown before flip-back
    moves: 0,
    matches: 0,
    won: false,
    startedAt: null,
    endedAt: null,
  };
}

function flip(game, index) {
  if (game.locked || game.won) return false;
  const card = game.cards[index];
  if (!card || card.matched || card.flipped) return false;

  if (game.startedAt === null) game.startedAt = Date.now();
  card.flipped = true;

  if (game.pending === null) {
    game.pending = index;
    return true;
  }

  game.moves++;
  const first = game.cards[game.pending];
  if (first.symbol === card.symbol) {
    first.matched = true;
    card.matched = true;
    game.matches++;
    game.pending = null;
    if (game.matches === game.pairCount) {
      game.won = true;
      game.endedAt = Date.now();
    }
  } else {
    game.locked = true;
  }
  return true;
}

// Called after the UI's mismatch-display delay to flip the pending pair back down.
function resolveMismatch(game) {
  if (!game.locked) return;
  for (const c of game.cards) {
    if (c.flipped && !c.matched) c.flipped = false;
  }
  game.pending = null;
  game.locked = false;
}
