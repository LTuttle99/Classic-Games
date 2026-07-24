'use strict';

let game = newGame();
let hintKey = null;
let autoTimer = null;

const $ = sel => document.querySelector(sel);

function cardKey(card) { return card.id; }

function cardEl(card, { faceUp = true, selected = false, hint = false } = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (faceUp ? '' : ' card-back') + (selected ? ' selected' : '') + (hint ? ' hint' : '');
  if (faceUp) {
    el.classList.add(SUIT_COLOR[card.suit]);
    el.innerHTML = `<span class="corner top">${card.rank}<br>${SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="pip">${SUIT_SYMBOL[card.suit]}</span>` +
      `<span class="corner bottom">${card.rank}<br>${SUIT_SYMBOL[card.suit]}</span>`;
  }
  return el;
}

function isSelected(sel, source, col, index, suit) {
  if (!sel || sel.source !== source) return false;
  if (source === 'tableau') return sel.col === col && index >= sel.index;
  if (source === 'foundation') return sel.suit === suit;
  return true; // waste
}

function render() {
  $('#moves').textContent = game.moves;

  renderStock();
  renderWaste();
  for (const suit of SUITS) renderFoundation(suit);
  for (let col = 0; col < 7; col++) renderColumn(col);
  renderControls();

  $('#auto-btn').disabled = !autoCompleteAvailable(game) || !!autoTimer;
}

function renderStock() {
  const el = $('#stock-pile');
  el.innerHTML = '';
  if (game.stock.length > 0) {
    el.appendChild(cardEl(null, { faceUp: false }));
  } else {
    const icon = document.createElement('div');
    icon.className = 'pile-icon';
    icon.textContent = '↺';
    el.appendChild(icon);
  }
  el.onclick = () => { clearSelection(game); drawFromStock(game); render(); };
}

function renderWaste() {
  const el = $('#waste-pile');
  el.innerHTML = '';
  const w = topOfWaste(game);
  if (w) {
    const selected = isSelected(game.selection, 'waste');
    const c = cardEl(w.card, { faceUp: true, selected, hint: hintKey === cardKey(w.card) });
    c.onclick = () => { select(game, { source: 'waste' }); render(); };
    c.ondblclick = () => { autoToFoundation(game, { source: 'waste' }); render(); };
    el.appendChild(c);
  }
}

function renderFoundation(suit) {
  const el = $(`#foundation-${suit}`);
  el.innerHTML = '';
  const pile = game.foundations[suit];
  if (pile.length === 0) {
    el.textContent = SUIT_SYMBOL[suit];
    el.onclick = () => {
      if (game.selection) { moveSelectionToFoundation(game, suit); render(); }
    };
    return;
  }
  const top = pile[pile.length - 1];
  const selected = isSelected(game.selection, 'foundation', null, null, suit);
  const c = cardEl(top, { faceUp: true, selected, hint: hintKey === cardKey(top) });
  c.onclick = () => {
    if (game.selection && game.selection.source !== 'foundation') {
      if (moveSelectionToFoundation(game, suit)) { render(); return; }
    }
    select(game, { source: 'foundation', suit });
    render();
  };
  el.appendChild(c);
}

function renderColumn(col) {
  const el = $(`#col-${col}`);
  el.innerHTML = '';
  const stack = game.tableau[col];
  const fan = getComputedStyle(document.documentElement).getPropertyValue('--fan');
  const fanPx = parseFloat(fan) || 26;
  el.style.height = `${Math.max(1, stack.length - 1) * fanPx + 106}px`;

  stack.forEach((entry, index) => {
    const isTop = index === stack.length - 1;
    const selected = entry.faceUp && isSelected(game.selection, 'tableau', col, index);
    const c = cardEl(entry.card, { faceUp: entry.faceUp, selected, hint: entry.faceUp && hintKey === cardKey(entry.card) });
    c.style.top = `${index * fanPx}px`;
    c.style.zIndex = String(index);
    if (entry.faceUp) {
      c.onclick = () => handleTableauClick(col, index, isTop);
      if (isTop) c.ondblclick = () => { autoToFoundation(game, { source: 'tableau', col, index }); render(); };
    }
    el.appendChild(c);
  });

  if (stack.length === 0) {
    el.onclick = () => { if (game.selection) { moveSelectionToTableau(game, col); render(); } };
  } else {
    el.onclick = null;
  }
}

function handleTableauClick(col, index, isTop) {
  if (isTop && game.selection && !(game.selection.source === 'tableau' && game.selection.col === col)) {
    if (moveSelectionToTableau(game, col)) { render(); return; }
  }
  select(game, { source: 'tableau', col, index });
  render();
}

function renderControls() {
  const el = $('#controls');
  el.innerHTML = '';
  if (game.won) {
    const msg = document.createElement('div');
    msg.className = 'control-msg win';
    msg.textContent = `You win in ${game.moves} moves! 🎉`;
    el.appendChild(msg);
    return;
  }
  const msg = document.createElement('div');
  msg.className = 'control-msg';
  msg.textContent = game.selection ? 'Card selected — click a destination pile.' : 'Click a card to select it, then click where it should go.';
  el.appendChild(msg);
}

function showHint() {
  const found = findHint(game);
  if (!found) return;
  hintKey = found;
  render();
  setTimeout(() => { hintKey = null; render(); }, 1600);
}

function findHint(game) {
  const w = topOfWaste(game);
  if (w && canStackFoundation(w.card, game.foundations[w.card.suit])) return cardKey(w.card);
  for (let col = 0; col < 7; col++) {
    const t = topOfTableau(game, col);
    if (t && t.faceUp && canStackFoundation(t.card, game.foundations[t.card.suit])) return cardKey(t.card);
  }
  for (let col = 0; col < 7; col++) {
    const t = topOfTableau(game, col);
    if (!t || !t.faceUp) continue;
    for (let dest = 0; dest < 7; dest++) {
      if (dest === col) continue;
      const destTop = topOfTableau(game, dest);
      if (canStackTableau(t.card, destTop ? destTop.card : null)) return cardKey(t.card);
    }
  }
  if (w) {
    for (let dest = 0; dest < 7; dest++) {
      const destTop = topOfTableau(game, dest);
      if (canStackTableau(w.card, destTop ? destTop.card : null)) return cardKey(w.card);
    }
  }
  return null;
}

function runAutoFinish() {
  if (autoTimer) return;
  autoTimer = setInterval(() => {
    const moved = autoFinishStep(game);
    render();
    if (!moved || game.won) { clearInterval(autoTimer); autoTimer = null; render(); }
  }, 180);
}

function boot() {
  render();
  $('#new-game-btn').addEventListener('click', () => {
    if (confirm('Start a new game? Current progress will be lost.')) {
      game = newGame();
      hintKey = null;
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
      render();
    }
  });
  $('#hint-btn').addEventListener('click', showHint);
  $('#auto-btn').addEventListener('click', runAutoFinish);
}

document.addEventListener('DOMContentLoaded', boot);
