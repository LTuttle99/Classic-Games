'use strict';

let game = newGame();
let acc = 0;
let lastTime = null;

const $ = sel => document.querySelector(sel);
const canvas = () => $('#canvas');
const nextCanvas = () => $('#next-canvas');

function resizeCanvases() {
  for (const c of [canvas(), nextCanvas()]) {
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
  }
}

function drawCell(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  ctx.fillStyle = '#ffffff30';
  ctx.fillRect(x + 1, y + 1, size - 2, Math.max(2, size * 0.18));
}

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  const cell = c.width / COLS;
  ctx.clearRect(0, 0, c.width, c.height);

  // grid lines
  ctx.strokeStyle = '#ffffff0a';
  for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, c.height); ctx.stroke(); }
  for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(c.width, y * cell); ctx.stroke(); }

  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      const t = game.board[r][col];
      if (t) drawCell(ctx, col * cell, r * cell, cell, COLORS[t]);
    }
  }

  if (game.current) {
    const p = game.current;
    const gr = ghostRow(game);
    if (gr !== null) {
      ctx.globalAlpha = 0.25;
      forEachCell(p, (r, c2) => { if (gr + r >= 0) drawCell(ctx, (p.col + c2) * cell, (gr + r) * cell, cell, COLORS[p.type]); });
      ctx.globalAlpha = 1;
    }
    forEachCell(p, (r, c2) => { if (p.row + r >= 0) drawCell(ctx, (p.col + c2) * cell, (p.row + r) * cell, cell, COLORS[p.type]); });
  }

  const nc = nextCanvas();
  const nctx = nc.getContext('2d');
  nctx.clearRect(0, 0, nc.width, nc.height);
  if (game.nextType) {
    const shape = SHAPES[game.nextType];
    const ncell = nc.width / 4;
    const offset = (4 - shape.length) / 2;
    for (let r = 0; r < shape.length; r++) {
      for (let cc = 0; cc < shape[r].length; cc++) {
        if (shape[r][cc]) drawCell(nctx, (cc + offset) * ncell, (r + offset) * ncell, ncell, COLORS[game.nextType]);
      }
    }
  }
}

function forEachCell(piece, fn) {
  for (let r = 0; r < piece.matrix.length; r++) {
    for (let c = 0; c < piece.matrix[r].length; c++) {
      if (piece.matrix[r][c]) fn(r, c);
    }
  }
}

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = now - lastTime;
  lastTime = now;

  resizeCanvases();

  if (!game.over) {
    acc += dt;
    while (acc >= game.dropInterval) {
      acc -= game.dropInterval;
      step(game);
      if (game.over) { showOverlay(); break; }
    }
    $('#score').textContent = game.score;
    $('#best').textContent = game.best;
    $('#level').textContent = game.level;
  }
  draw();
  requestAnimationFrame(loop);
}

function showOverlay() {
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  overlay.classList.add('show');
  const msg = document.createElement('div');
  msg.className = 'overlay-msg';
  msg.textContent = `Game Over — Score ${game.score}`;
  overlay.appendChild(msg);
  const btn = document.createElement('button');
  btn.textContent = 'Play Again';
  btn.addEventListener('click', restart);
  overlay.appendChild(btn);
}

function restart() {
  game = newGame();
  acc = 0;
  $('#overlay').classList.remove('show');
  $('#score').textContent = 0;
  $('#best').textContent = game.best;
  $('#level').textContent = 1;
}

function doStep() { if (!game.over) { step(game); acc = 0; } }
function doLeft() { if (!game.over) tryMove(game, 0, -1); }
function doRight() { if (!game.over) tryMove(game, 0, 1); }
function doRotate() { if (!game.over) tryRotate(game); }
function doDrop() { if (!game.over) { hardDrop(game); acc = 0; } }

const KEY_ACTIONS = {
  ArrowLeft: doLeft, a: doLeft, A: doLeft,
  ArrowRight: doRight, d: doRight, D: doRight,
  ArrowDown: doStep, s: doStep, S: doStep,
  ArrowUp: doRotate, w: doRotate, W: doRotate,
  ' ': doDrop,
};

// Binds a control button so it fires immediately on press and then auto-repeats
// while held — plain `click` alone makes directional movement painfully slow on
// touch. Pointer events are the primary path (works for mouse, touch, and pen in
// one listener), with a `click` fallback guarded against double-firing, in case
// some environment doesn't dispatch pointer events the way a real browser does.
function bindHold(el, action, { delay = 220, interval = 80 } = {}) {
  let timer = null;
  let handledByPointer = false;
  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    handledByPointer = true;
    action();
    stop();
    timer = setTimeout(function repeat() {
      action();
      timer = setTimeout(repeat, interval);
    }, delay);
  });
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('click', () => {
    if (handledByPointer) { handledByPointer = false; return; }
    action();
  });
  el.addEventListener('contextmenu', e => e.preventDefault());
}

function bindTap(el, action) {
  let handledByPointer = false;
  el.addEventListener('pointerdown', e => { e.preventDefault(); handledByPointer = true; action(); });
  el.addEventListener('click', () => {
    if (handledByPointer) { handledByPointer = false; return; }
    action();
  });
  el.addEventListener('contextmenu', e => e.preventDefault());
}

function boot() {
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);
  $('#best').textContent = game.best;

  document.addEventListener('keydown', e => {
    const action = KEY_ACTIONS[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  });

  bindHold($('#btn-left'), doLeft);
  bindHold($('#btn-right'), doRight);
  bindHold($('#btn-down'), doStep, { delay: 120, interval: 50 });
  bindTap($('#btn-rotate'), doRotate);
  bindTap($('#btn-drop'), doDrop);
  bindTap($('#new-game-btn'), restart);

  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
