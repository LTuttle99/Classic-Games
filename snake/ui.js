'use strict';

let game = newGame();
let acc = 0;
let lastTime = null;
let paused = false;

const $ = sel => document.querySelector(sel);
const canvas = () => $('#canvas');

function resizeCanvas() {
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(rect.width * dpr);
  c.height = Math.round(rect.height * dpr);
}

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  const cell = c.width / GRID;
  ctx.clearRect(0, 0, c.width, c.height);

  if (game.food) {
    ctx.fillStyle = '#e5453f';
    const pad = cell * 0.15;
    ctx.beginPath();
    ctx.arc(game.food.x * cell + cell / 2, game.food.y * cell + cell / 2, cell / 2 - pad, 0, Math.PI * 2);
    ctx.fill();
  }

  game.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? '#8be07a' : '#5fbf4e';
    const pad = cell * 0.08;
    roundRect(ctx, seg.x * cell + pad, seg.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.22);
    ctx.fill();
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = now - lastTime;
  lastTime = now;

  if (!game.over && !paused) {
    acc += dt;
    while (acc >= game.interval) {
      acc -= game.interval;
      tick(game);
      if (game.over) { showOverlay(); break; }
    }
    $('#score').textContent = game.score;
    $('#best').textContent = game.best;
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
}

const KEY_DIR = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  $('#best').textContent = game.best;

  document.addEventListener('keydown', e => {
    const dir = KEY_DIR[e.key];
    if (!dir) return;
    e.preventDefault();
    setDirection(game, dir[0], dir[1]);
  });

  document.querySelectorAll('.dpad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDirection(game, parseInt(btn.dataset.dx, 10), parseInt(btn.dataset.dy, 10));
    });
  });

  $('#new-game-btn').addEventListener('click', restart);

  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
