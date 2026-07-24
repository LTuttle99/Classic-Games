'use strict';

/* =========================================================================
   SOLITAIRE (Klondike, deal-by-1) — game engine
   ========================================================================= */

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = { S: 'black', C: 'black', H: 'red', D: 'red' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 1]));

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

function newGame() {
  const deck = shuffle(makeDeck());
  const tableau = [[], [], [], [], [], [], []];
  let idx = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      tableau[col].push({ card: deck[idx++], faceUp: row === col });
    }
  }
  const stock = deck.slice(idx).map(card => ({ card, faceUp: false }));
  return {
    tableau,
    stock,
    waste: [],
    foundations: { S: [], H: [], D: [], C: [] },
    selection: null, // { source: 'waste'|'tableau'|'foundation', col?: number, index?: number }
    moves: 0,
    won: false,
    log: [],
  };
}

function log(game, msg) {
  game.log.push(msg);
  if (game.log.length > 200) game.log.shift();
}

function isRed(suit) { return suit === 'H' || suit === 'D'; }

function canStackTableau(card, ontoCard) {
  if (!ontoCard) return card.rank === 'K';
  return isRed(card.suit) !== isRed(ontoCard.suit) && RANK_VALUE[card.rank] === RANK_VALUE[ontoCard.rank] - 1;
}

function canStackFoundation(card, pile) {
  if (pile.length === 0) return card.rank === 'A';
  const top = pile[pile.length - 1];
  return card.suit === top.suit && RANK_VALUE[card.rank] === RANK_VALUE[top.rank] + 1;
}

function drawFromStock(game) {
  if (game.stock.length === 0) {
    if (game.waste.length === 0) return;
    game.stock = game.waste.reverse().map(w => ({ card: w.card, faceUp: false }));
    game.waste = [];
    log(game, 'Recycled waste into stock.');
    return;
  }
  const drawn = game.stock.pop();
  drawn.faceUp = true;
  game.waste.push(drawn);
  log(game, `Draw ${cardLabel(drawn.card)}`);
}

function topOfWaste(game) { return game.waste.length ? game.waste[game.waste.length - 1] : null; }
function topOfTableau(game, col) {
  const c = game.tableau[col];
  return c.length ? c[c.length - 1] : null;
}

function select(game, sel) {
  if (game.selection && sel && game.selection.source === sel.source &&
      game.selection.col === sel.col && game.selection.index === sel.index &&
      game.selection.suit === sel.suit) {
    game.selection = null; // click same selection again -> deselect
    return;
  }
  game.selection = sel;
}

function clearSelection(game) { game.selection = null; }

function getSelectedCards(game) {
  const sel = game.selection;
  if (!sel) return [];
  if (sel.source === 'waste') {
    const w = topOfWaste(game);
    return w ? [w.card] : [];
  }
  if (sel.source === 'foundation') {
    const pile = game.foundations[sel.suit];
    return pile.length ? [pile[pile.length - 1]] : [];
  }
  if (sel.source === 'tableau') {
    return game.tableau[sel.col].slice(sel.index).filter(x => x.faceUp).map(x => x.card);
  }
  return [];
}

// Attempt to move the current selection onto a tableau column.
function moveSelectionToTableau(game, destCol) {
  const sel = game.selection;
  if (!sel) return false;
  const cards = getSelectedCards(game);
  if (cards.length === 0) return false;
  const destTop = topOfTableau(game, destCol);
  if (!canStackTableau(cards[0], destTop ? destTop.card : null)) return false;
  if (sel.source === 'tableau' && sel.col === destCol) return false;

  removeSelection(game);
  for (const card of cards) game.tableau[destCol].push({ card, faceUp: true });
  flipNewTopIfNeeded(game, sel);
  game.moves++;
  log(game, `Move ${cards.map(cardLabel).join(' ')} to column ${destCol + 1}`);
  clearSelection(game);
  return true;
}

// Attempt to move the current selection onto its foundation.
function moveSelectionToFoundation(game, suit) {
  const sel = game.selection;
  if (!sel) return false;
  const cards = getSelectedCards(game);
  if (cards.length !== 1) return false;
  const card = cards[0];
  if (card.suit !== suit) return false;
  if (!canStackFoundation(card, game.foundations[suit])) return false;

  removeSelection(game);
  game.foundations[suit].push(card);
  flipNewTopIfNeeded(game, sel);
  game.moves++;
  log(game, `${cardLabel(card)} to foundation`);
  clearSelection(game);
  checkWin(game);
  return true;
}

// Try to auto-send a single top card straight to its foundation (double-click convenience).
function autoToFoundation(game, sel) {
  const prevSelection = game.selection;
  game.selection = sel;
  const cards = getSelectedCards(game);
  if (cards.length !== 1) { game.selection = prevSelection; return false; }
  const card = cards[0];
  if (!canStackFoundation(card, game.foundations[card.suit])) { game.selection = prevSelection; return false; }
  return moveSelectionToFoundation(game, card.suit);
}

function removeSelection(game) {
  const sel = game.selection;
  if (sel.source === 'waste') game.waste.pop();
  else if (sel.source === 'foundation') game.foundations[sel.suit].pop();
  else if (sel.source === 'tableau') game.tableau[sel.col].splice(sel.index);
}

function flipNewTopIfNeeded(game, sel) {
  if (sel.source !== 'tableau') return;
  const col = game.tableau[sel.col];
  if (col.length > 0 && !col[col.length - 1].faceUp) {
    col[col.length - 1].faceUp = true;
    log(game, `Flip ${cardLabel(col[col.length - 1].card)} in column ${sel.col + 1}`);
  }
}

function checkWin(game) {
  const total = SUITS.reduce((sum, s) => sum + game.foundations[s].length, 0);
  if (total === 52) {
    game.won = true;
    log(game, 'You win! All 52 cards home. 🎉');
  }
}

function autoCompleteAvailable(game) {
  // true once every tableau card is face up and the stock is empty — safe to offer "auto-finish"
  if (game.stock.length > 0) return false;
  return game.tableau.every(col => col.every(x => x.faceUp));
}

// One greedy pass: move any waste/tableau top card that fits a foundation. Returns whether anything moved.
function autoFinishStep(game) {
  let moved = false;
  const w = topOfWaste(game);
  if (w && canStackFoundation(w.card, game.foundations[w.card.suit])) {
    game.waste.pop();
    game.foundations[w.card.suit].push(w.card);
    log(game, `${cardLabel(w.card)} to foundation`);
    game.moves++;
    moved = true;
  }
  for (let col = 0; col < 7; col++) {
    const t = topOfTableau(game, col);
    if (t && t.faceUp && canStackFoundation(t.card, game.foundations[t.card.suit])) {
      game.tableau[col].pop();
      game.foundations[t.card.suit].push(t.card);
      log(game, `${cardLabel(t.card)} to foundation`);
      game.moves++;
      moved = true;
    }
  }
  checkWin(game);
  return moved;
}
