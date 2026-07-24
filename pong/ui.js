'use strict';

let game = newGame();
const input = { targetY: null, up: false, down: false };
let lastTime = null;
let rafId = null;

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
  const scaleX = c.width / W;
  const scaleY = c.height / H;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // center dashed line
  ctx.strokeStyle = '#ffffff22';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#e8c469';
  ctx.fillRect(0, game.player.y, PADDLE_W, PADDLE_H);
  ctx.fillStyle = '#7fb3ff';
  ctx.fillRect(W - PADDLE_W, game.ai.y, PADDLE_W, PADDLE_H);

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(game.ball.x, game.ball.y, BALL_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
}

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  if (game.running) {
    update(game, dt, input);
    $('#score-player').textContent = game.scores.player;
    $('#score-ai').textContent = game.scores.ai;
    if (!game.running) showOverlay();
  }
  draw();
  rafId = requestAnimationFrame(loop);
}

function showOverlay() {
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  overlay.classList.add('show');
  const msg = document.createElement('div');
  msg.className = 'overlay-msg';
  msg.textContent = game.winner === 'player' ? 'You win!' : 'CPU wins.';
  overlay.appendChild(msg);
  const btn = document.createElement('button');
  btn.textContent = 'Play Again';
  btn.addEventListener('click', restart);
  overlay.appendChild(btn);
}

function restart() {
  game = newGame();
  $('#overlay').classList.remove('show');
  $('#score-player').textContent = 0;
  $('#score-ai').textContent = 0;
}

function localY(clientY) {
  const rect = canvas().getBoundingClientRect();
  return ((clientY - rect.top) / rect.height) * H;
}

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const c = canvas();
  c.addEventListener('mousemove', e => {
    input.targetY = localY(e.clientY);
    input.up = false; input.down = false;
  });
  c.addEventListener('touchmove', e => {
    e.preventDefault();
    input.targetY = localY(e.touches[0].clientY);
    input.up = false; input.down = false;
  }, { passive: false });

  const KEY_UP = new Set(['ArrowUp', 'w', 'W']);
  const KEY_DOWN = new Set(['ArrowDown', 's', 'S']);
  document.addEventListener('keydown', e => {
    if (KEY_UP.has(e.key)) { input.up = true; input.targetY = null; e.preventDefault(); }
    if (KEY_DOWN.has(e.key)) { input.down = true; input.targetY = null; e.preventDefault(); }
  });
  document.addEventListener('keyup', e => {
    if (KEY_UP.has(e.key)) input.up = false;
    if (KEY_DOWN.has(e.key)) input.down = false;
  });

  $('#new-game-btn').addEventListener('click', restart);

  rafId = requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
