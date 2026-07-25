'use strict';

let game = newGame();
let lastTime = null;

const $ = sel => document.querySelector(sel);
const canvas = () => $('#canvas');

function resizeCanvas() {
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
}

// stable per-asteroid jagged silhouette from its seed (mulberry32 PRNG)
function seededPoints(seed, count) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pts = [];
  for (let i = 0; i < count; i++) pts.push(0.68 + next() * 0.32);
  return pts;
}
const asteroidShapeCache = new Map();
function shapeFor(a) {
  let s = asteroidShapeCache.get(a.seed);
  if (!s) { s = seededPoints(a.seed, 10); asteroidShapeCache.set(a.seed, s); }
  return s;
}

function drawShip(ctx, scale) {
  const s = game.ship;
  if (!s.alive) return;
  if (s.invuln > 0 && Math.floor(s.invuln * 8) % 2 === 0) return; // blink while invulnerable
  const x = s.x * scale, y = s.y * scale;
  const r = SHIP_RADIUS * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(s.angle);
  ctx.strokeStyle = '#eafcff';
  ctx.fillStyle = '#0d2233';
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.8, r * 0.72);
  ctx.lineTo(-r * 0.4, 0);
  ctx.lineTo(-r * 0.8, -r * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (s.thrusting) {
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, 0);
    ctx.lineTo(-r * (1.1 + Math.random() * 0.5), 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAsteroid(ctx, scale, a) {
  const pts = shapeFor(a);
  const x = a.x * scale, y = a.y * scale, r = a.radius * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a.angle);
  ctx.strokeStyle = '#c9c9d8';
  ctx.fillStyle = '#1c1c2c';
  ctx.lineWidth = Math.max(1.2, r * 0.045);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const ang = (i / pts.length) * Math.PI * 2;
    const rr = r * pts[i];
    const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBullet(ctx, scale, b) {
  ctx.fillStyle = '#ffe45a';
  ctx.beginPath();
  ctx.arc(b.x * scale, b.y * scale, Math.max(1.5, 2.4 * scale), 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  const scale = c.width / WORLD_W;
  ctx.fillStyle = '#05050c';
  ctx.fillRect(0, 0, c.width, c.height);

  for (const a of game.asteroids) drawAsteroid(ctx, scale, a);
  for (const b of game.bullets) drawBullet(ctx, scale, b);
  drawShip(ctx, scale);
}

function updateHud() {
  $('#score').textContent = game.score;
  $('#best').textContent = game.best;
  $('#lives').textContent = game.lives;
  $('#wave').textContent = game.wave;
}

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  resizeCanvas();

  if (!game.over) {
    update(game, dt);
    updateHud();
    if (game.over) showGameOverOverlay();
  }
  draw();
  requestAnimationFrame(loop);
}

function showGameOverOverlay() {
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  overlay.classList.add('show');
  const msg = document.createElement('div');
  msg.className = 'overlay-msg';
  msg.textContent = 'Game Over';
  overlay.appendChild(msg);
  const sub = document.createElement('div');
  sub.className = 'overlay-sub';
  sub.textContent = `Score ${game.score} — reached wave ${game.wave}`;
  overlay.appendChild(sub);
  const btn = document.createElement('button');
  btn.textContent = 'Play Again';
  btn.addEventListener('click', restart);
  overlay.appendChild(btn);
}

function restart() {
  game = newGame();
  $('#overlay').classList.remove('show');
  updateHud();
}

const KEY_MAP = {
  ArrowLeft: 'rotateLeft', a: 'rotateLeft', A: 'rotateLeft',
  ArrowRight: 'rotateRight', d: 'rotateRight', D: 'rotateRight',
  ArrowUp: 'thrust', w: 'thrust', W: 'thrust',
  ' ': 'firing',
};

function bindHold(el, key) {
  let active = false;
  const start = e => {
    if (e) e.preventDefault();
    if (active) return;
    active = true;
    el.classList.add('held');
    setInput(game, { [key]: true });
  };
  const end = () => {
    if (!active) return;
    active = false;
    el.classList.remove('held');
    setInput(game, { [key]: false });
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  updateHud();

  const keyHeld = {};
  document.addEventListener('keydown', e => {
    const key = KEY_MAP[e.key];
    if (!key) return;
    e.preventDefault();
    if (!keyHeld[e.key]) { keyHeld[e.key] = true; setInput(game, { [key]: true }); }
  });
  document.addEventListener('keyup', e => {
    const key = KEY_MAP[e.key];
    if (!key) return;
    keyHeld[e.key] = false;
    setInput(game, { [key]: false });
  });

  bindHold($('#btn-left'), 'rotateLeft');
  bindHold($('#btn-right'), 'rotateRight');
  bindHold($('#btn-thrust'), 'thrust');
  bindHold($('#btn-fire'), 'firing');

  $('#new-game-btn').addEventListener('click', restart);

  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
