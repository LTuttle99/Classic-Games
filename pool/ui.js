'use strict';

let game = newGame();
let lastTime = null;
let drag = null; // { startX, startY } in canvas pixel space

const $ = sel => document.querySelector(sel);
const canvas = () => $('#canvas');

const BALL_COLORS = {
  1: '#e6b800', 2: '#1e5fbf', 3: '#d1332e', 4: '#5b3a99', 5: '#e07b1e', 6: '#1e8f4e', 7: '#7a1f22',
  9: '#e6b800', 10: '#1e5fbf', 11: '#d1332e', 12: '#5b3a99', 13: '#e07b1e', 14: '#1e8f4e', 15: '#7a1f22',
  8: '#181818',
};
const CUE_COLOR = '#f5f0e6';
const MAX_DRAG_PX = 160;

function resizeCanvas() {
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
}

function scaleOf(c) { return c.width / TABLE_W; }

function drawTable(ctx, c, scale) {
  ctx.fillStyle = '#3a2416';
  ctx.fillRect(0, 0, c.width, c.height);
  const railW = 14 * scale;
  ctx.fillStyle = '#0c5c3c';
  ctx.fillRect(railW, railW, c.width - railW * 2, c.height - railW * 2);

  // faint diamonds / rail markers
  ctx.strokeStyle = '#ffffff22';
  ctx.lineWidth = Math.max(1, scale);
  ctx.strokeRect(railW, railW, c.width - railW * 2, c.height - railW * 2);

  for (const p of game.pockets) {
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(p.x * scale, p.y * scale, POCKET_R * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBall(ctx, scale, b) {
  const x = b.x * scale, y = b.y * scale, r = BALL_R * scale;
  if (b.id === 0) {
    ctx.fillStyle = CUE_COLOR;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#00000030'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke();
    return;
  }
  const color = BALL_COLORS[b.id];
  const isStripe = b.id >= 9;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = isStripe ? '#f5f0e6' : color;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (isStripe) {
    ctx.fillStyle = color;
    ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1);
  }
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = `bold ${Math.max(6, r * 0.6)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(b.id), x, y + 0.5);
  ctx.strokeStyle = '#00000040'; ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}

function drawAimLine(ctx, scale) {
  if (!drag) return;
  const cue = cueBall(game);
  if (!cue.active) return;
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const cx = cue.x * scale, cy = cue.y * scale;
  const dx = drag.curX - drag.startCueX, dy = drag.curY - drag.startCueY;
  const dragDist = Math.hypot(dx, dy);
  const power = Math.min(1, dragDist / MAX_DRAG_PX);
  if (dragDist < 4) return;
  const angle = Math.atan2(-dy, -dx);
  const aimLen = Math.min(dragDist, MAX_DRAG_PX) * 1.6;

  ctx.strokeStyle = `rgba(232,196,105,${0.4 + power * 0.5})`;
  ctx.lineWidth = Math.max(1.5, 2.2 * scale);
  ctx.setLineDash([6 * scale, 5 * scale]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * aimLen, cy + Math.sin(angle) * aimLen);
  ctx.stroke();
  ctx.setLineDash([]);

  // cue stick pulled back opposite the aim direction
  ctx.strokeStyle = '#caa06a';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.lineCap = 'round';
  const pull = 18 + power * 60;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(angle) * (pull + BALL_R * scale * 1.5), cy - Math.sin(angle) * (pull + BALL_R * scale * 1.5));
  ctx.lineTo(cx - Math.cos(angle) * (BALL_R * scale * 1.5), cy - Math.sin(angle) * (BALL_R * scale * 1.5));
  ctx.stroke();
}

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  const scale = scaleOf(c);
  drawTable(ctx, c, scale);
  for (const b of game.balls) if (b.active) drawBall(ctx, scale, b);
  drawAimLine(ctx, scale);
}

function statusText() {
  if (game.over) return null;
  if (game.phase === 'shooting') return 'Balls rolling…';
  if (game.turn === 'ai') return game.aiDelay > 0 ? 'AI thinking…' : 'AI shooting…';
  if (game.lastFoul) return `Foul (${game.lastFoul}) — your turn`;
  return 'Your turn — drag back from the cue ball';
}

function updateHud() {
  $('#wins').textContent = game.wins;
  $('#turn').textContent = game.turn === 'player' ? 'You' : 'AI';
  $('#group').textContent = game.playerGroup ? (game.playerGroup === 'solid' ? 'Solids' : 'Stripes') : '—';
  const banner = $('#banner');
  const text = statusText();
  if (text) { banner.textContent = text; banner.classList.add('show'); }
  else { banner.classList.remove('show'); }
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
  msg.textContent = game.winner === 'player' ? 'You Win!' : 'AI Wins';
  overlay.appendChild(msg);
  const sub = document.createElement('div');
  sub.className = 'overlay-sub';
  sub.textContent = `Wins: ${game.wins}`;
  overlay.appendChild(sub);
  const btn = document.createElement('button');
  btn.textContent = 'Play Again';
  btn.addEventListener('click', restart);
  overlay.appendChild(btn);
}

function restart() {
  game = newGame();
  drag = null;
  $('#overlay').classList.remove('show');
  updateHud();
}

function canvasPoint(e) {
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (c.width / rect.width);
  const py = (e.clientY - rect.top) * (c.height / rect.height);
  return { x: px, y: py };
}

function canAim() { return !game.over && game.phase === 'aiming' && game.turn === 'player'; }

function onPointerDown(e) {
  if (!canAim()) return;
  e.preventDefault();
  const c = canvas();
  const scale = scaleOf(c);
  const cue = cueBall(game);
  const p = canvasPoint(e);
  drag = { startX: p.x, startY: p.y, curX: p.x, curY: p.y, startCueX: cue.x * scale, startCueY: cue.y * scale };
  c.setPointerCapture && c.setPointerCapture(e.pointerId);
}
function onPointerMove(e) {
  if (!drag) return;
  const p = canvasPoint(e);
  drag.curX = p.x; drag.curY = p.y;
}
function onPointerUp(e) {
  if (!drag || !canAim()) { drag = null; return; }
  const dx = drag.curX - drag.startCueX, dy = drag.curY - drag.startCueY;
  const dragDist = Math.hypot(dx, dy);
  if (dragDist >= 6) {
    const angle = Math.atan2(-dy, -dx);
    const power = Math.min(1, dragDist / MAX_DRAG_PX);
    const speed = 90 + power * (MAX_SHOT_SPEED - 90);
    takeShot(game, angle, speed);
  }
  drag = null;
}

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  updateHud();

  const c = canvas();
  c.addEventListener('pointerdown', onPointerDown);
  c.addEventListener('pointermove', onPointerMove);
  c.addEventListener('pointerup', onPointerUp);
  c.addEventListener('pointercancel', () => { drag = null; });

  $('#new-game-btn').addEventListener('click', restart);

  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
