'use strict';

let game = newGame();
let lastTime = null;
const VIEW_RANGE = 600;

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

function screenX(c, lateral) { return c.width * (0.5 + lateral * 0.42); }

function drawBombardier(ctx, c) {
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#8fb8e0');
  grad.addColorStop(0.15, '#4a7a3c');
  grad.addColorStop(1, '#2c5222');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  // faint scrolling grid lines for a sense of motion
  const scrollOffset = (game.distance * 0.6) % 40;
  ctx.strokeStyle = '#ffffff12';
  ctx.lineWidth = 1;
  for (let y = c.height + scrollOffset; y > c.height * 0.15; y -= 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
  }

  for (const t of game.targets) {
    if (t.destroyed) continue;
    const rd = t.distance - game.distance;
    if (rd < -60 || rd > VIEW_RANGE) continue;
    const frac = Math.max(0, Math.min(1, rd / VIEW_RANGE));
    const y = c.height * (0.92 - frac * 0.8);
    const x = screenX(c, t.lateral);
    const size = c.width * (0.09 - frac * 0.055);
    ctx.fillStyle = '#7a5030';
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  }

  for (const b of game.bombsInAir) {
    if (b.resolved) continue;
    const progress = Math.max(0, Math.min(1, (game.elapsed - b.releaseTime) / b.fallTime));
    const curDist = b.releaseDistance + (b.impactDistance - b.releaseDistance) * progress;
    const rd = curDist - game.distance;
    if (rd < -60 || rd > VIEW_RANGE) continue;
    const frac = Math.max(0, Math.min(1, rd / VIEW_RANGE));
    const y = c.height * (0.92 - frac * 0.8);
    const x = screenX(c, b.lateral);
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(x, y, Math.max(2, c.width * 0.012 * (1 + progress)), 0, Math.PI * 2); ctx.fill();
  }

  const cx = screenX(c, game.aimLateral);
  const cy = c.height * 0.9;
  ctx.strokeStyle = '#ffe45a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
}

function drawGunner(ctx, c) {
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#3a5f9e');
  grad.addColorStop(1, '#9fc3e8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  for (const f of game.fighters) {
    const closeness = 1 - f.closing; // 0 far, 1 close
    const size = c.width * (0.05 + closeness * 0.22);
    const x = screenX(c, f.lateral);
    const y = c.height * (0.4 - closeness * 0.05);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#2c2c34';
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.5);
    ctx.lineTo(size * 0.5, size * 0.35);
    ctx.lineTo(0, size * 0.15);
    ctx.lineTo(-size * 0.5, size * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const barW = size * 1.1;
    ctx.fillStyle = '#00000080';
    ctx.fillRect(x - barW / 2, y - size * 0.7, barW, 4);
    ctx.fillStyle = '#d1332e';
    ctx.fillRect(x - barW / 2, y - size * 0.7, barW * (f.hp / FIGHTER_HP), 4);
  }

  const rx = screenX(c, game.gunReticle);
  const ry = c.height * 0.4;
  ctx.strokeStyle = game.gunLocked ? '#ff5a5a' : '#ffe45a';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(rx, ry, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx - 30, ry); ctx.lineTo(rx - 12, ry); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx + 12, ry); ctx.lineTo(rx + 30, ry); ctx.stroke();

  // heat gauge
  const gw = c.width * 0.3, gh = 10;
  const gx = c.width / 2 - gw / 2, gy = c.height - 26;
  ctx.fillStyle = '#00000080';
  ctx.fillRect(gx, gy, gw, gh);
  ctx.fillStyle = game.gunLocked ? '#ff5a5a' : '#ffb347';
  ctx.fillRect(gx, gy, gw * game.gunHeat, gh);
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, gh);
}

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  if (game.view === 'bombardier') drawBombardier(ctx, c);
  else drawGunner(ctx, c);
}

function updateHud() {
  $('#score').textContent = game.score;
  $('#best').textContent = game.best;
  $('#hp').textContent = Math.round(game.hp);
  $('#bombs').textContent = game.bombsLeft;
  $('#viewLabel').textContent = game.view === 'bombardier' ? 'BOMBARDIER' : 'GUNNER';
  $('#btn-action').textContent = game.view === 'bombardier' ? 'Drop Bomb' : 'Fire';
}

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  resizeCanvas();

  if (!game.over) {
    update(game, dt);
    updateHud();
    if (game.over) showEndOverlay();
  }
  draw();
  requestAnimationFrame(loop);
}

function showEndOverlay() {
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  overlay.classList.add('show');
  const msg = document.createElement('div');
  msg.className = 'overlay-msg';
  msg.textContent = game.win ? 'Mission Complete' : 'Shot Down';
  overlay.appendChild(msg);
  const sub = document.createElement('div');
  sub.className = 'overlay-sub';
  sub.textContent = `Score ${game.score} — Best ${game.best}`;
  overlay.appendChild(sub);
  const btn = document.createElement('button');
  btn.textContent = 'Fly Again';
  btn.addEventListener('click', restart);
  overlay.appendChild(btn);
}

function restart() {
  game = newGame();
  $('#overlay').classList.remove('show');
  updateHud();
}

function bindHold(el, key) {
  let active = false;
  const start = e => { if (e) e.preventDefault(); if (active) return; active = true; el.classList.add('held'); setInput(game, { [key]: true }); };
  const end = () => { if (!active) return; active = false; el.classList.remove('held'); setInput(game, { [key]: false }); };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

function bindTap(el, action) {
  let handledByPointer = false;
  el.addEventListener('pointerdown', e => { e.preventDefault(); handledByPointer = true; action(); });
  el.addEventListener('click', () => {
    if (handledByPointer) { handledByPointer = false; return; }
    action();
  });
}

const KEY_MAP = {
  ArrowUp: 'altUp', w: 'altUp', W: 'altUp',
  ArrowDown: 'altDown', s: 'altDown', S: 'altDown',
  ArrowLeft: 'aimLeft', a: 'aimLeft', A: 'aimLeft',
  ArrowRight: 'aimRight', d: 'aimRight', D: 'aimRight',
};

function doAction() {
  if (game.view === 'bombardier') dropBomb(game);
  else setInput(game, { fire: true });
}

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  updateHud();

  const keyHeld = {};
  document.addEventListener('keydown', e => {
    if (e.key === ' ') { e.preventDefault(); doAction(); return; }
    if (e.key === 'v' || e.key === 'V' || e.key === 'Tab') { e.preventDefault(); toggleView(game); updateHud(); return; }
    if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); setInput(game, { throttleDown: true }); return; }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setInput(game, { throttleUp: true }); return; }
    const key = KEY_MAP[e.key];
    if (!key) return;
    e.preventDefault();
    if (!keyHeld[e.key]) { keyHeld[e.key] = true; setInput(game, { [key]: true }); }
  });
  document.addEventListener('keyup', e => {
    if (e.key === ' ') { setInput(game, { fire: false }); return; }
    if (e.key === 'q' || e.key === 'Q') { setInput(game, { throttleDown: false }); return; }
    if (e.key === 'e' || e.key === 'E') { setInput(game, { throttleUp: false }); return; }
    const key = KEY_MAP[e.key];
    if (!key) return;
    keyHeld[e.key] = false;
    setInput(game, { [key]: false });
  });

  bindHold($('#btn-alt-up'), 'altUp');
  bindHold($('#btn-alt-down'), 'altDown');
  bindHold($('#btn-aim-left'), 'aimLeft');
  bindHold($('#btn-aim-right'), 'aimRight');
  bindHold($('#btn-throttle-up'), 'throttleUp');
  bindHold($('#btn-throttle-down'), 'throttleDown');

  const actionBtn = $('#btn-action');
  let firingHeld = false;
  actionBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (game.view === 'bombardier') { dropBomb(game); }
    else { firingHeld = true; setInput(game, { fire: true }); }
  });
  actionBtn.addEventListener('pointerup', () => { if (firingHeld) { firingHeld = false; setInput(game, { fire: false }); } });
  actionBtn.addEventListener('pointerleave', () => { if (firingHeld) { firingHeld = false; setInput(game, { fire: false }); } });

  bindTap($('#btn-view'), () => { toggleView(game); updateHud(); });
  bindTap($('#new-game-btn'), restart);

  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
