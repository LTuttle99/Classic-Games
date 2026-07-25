'use strict';

let game = newGame();
const input = { targetX: null, left: false, right: false };
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

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  const scaleX = c.width / W;
  const scaleY = c.height / H;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, W, H);

  for (const brick of game.bricks) {
    if (!brick.alive) continue;
    ctx.fillStyle = brick.color;
    ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
    ctx.fillStyle = '#ffffff25';
    ctx.fillRect(brick.x, brick.y, brick.w, brick.h * 0.35);
  }

  ctx.fillStyle = '#e8c469';
  ctx.fillRect(game.paddle.x, PADDLE_Y, PADDLE_W, PADDLE_H);

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(game.ball.x, game.ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
}

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  resizeCanvas();

  if (!game.over) {
    update(game, dt, input);
    $('#score').textContent = game.score;
    $('#best').textContent = game.best;
    $('#lives').textContent = game.lives;
    $('#level').textContent = game.level;
    if (game.over) showOverlay();
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
  $('#overlay').classList.remove('show');
  $('#score').textContent = 0;
  $('#best').textContent = game.best;
  $('#lives').textContent = game.lives;
  $('#level').textContent = game.level;
}

function tryLaunch() { if (!game.over) launchBall(game); }

function localX(clientX) {
  const rect = canvas().getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * W;
}

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  $('#best').textContent = game.best;

  const c = canvas();
  c.addEventListener('mousemove', e => { input.targetX = localX(e.clientX); });
  c.addEventListener('mousedown', tryLaunch);
  c.addEventListener('touchmove', e => {
    e.preventDefault();
    input.targetX = localX(e.touches[0].clientX);
  }, { passive: false });
  c.addEventListener('touchstart', e => {
    input.targetX = localX(e.touches[0].clientX);
    tryLaunch();
  }, { passive: true });

  const KEY_LEFT = new Set(['ArrowLeft', 'a', 'A']);
  const KEY_RIGHT = new Set(['ArrowRight', 'd', 'D']);
  document.addEventListener('keydown', e => {
    if (KEY_LEFT.has(e.key)) { input.left = true; input.targetX = null; e.preventDefault(); }
    if (KEY_RIGHT.has(e.key)) { input.right = true; input.targetX = null; e.preventDefault(); }
    if (e.key === ' ') { tryLaunch(); e.preventDefault(); }
  });
  document.addEventListener('keyup', e => {
    if (KEY_LEFT.has(e.key)) input.left = false;
    if (KEY_RIGHT.has(e.key)) input.right = false;
  });

  $('#new-game-btn').addEventListener('click', restart);

  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
