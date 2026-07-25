'use strict';

let game = newGame();
let lastTime = null;
let mouthPhase = 0;

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

function cellSize(c) { return { w: c.width / WIDTH, h: c.height / HEIGHT }; }

function drawMaze(ctx, cell) {
  ctx.fillStyle = '#060614';
  ctx.fillRect(0, 0, WIDTH * cell.w, HEIGHT * cell.h);

  ctx.strokeStyle = '#3a4bd6';
  ctx.lineWidth = Math.max(1.5, cell.w * 0.14);
  ctx.lineCap = 'round';
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (MAZE[y][x] !== '#') continue;
      const cx = x * cell.w + cell.w / 2, cy = y * cell.h + cell.h / 2;
      // draw short connective segments to neighboring wall cells for a linework look
      const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let any = false;
      for (const [dx, dy] of neighbors) {
        const nx = x + dx, ny = y + dy;
        if (ny < 0 || ny >= HEIGHT) continue;
        const nxWrapped = ((nx % WIDTH) + WIDTH) % WIDTH;
        if (MAZE[ny][nxWrapped] === '#') {
          any = true;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(nx * cell.w + cell.w / 2, ny * cell.h + cell.h / 2);
          ctx.stroke();
        }
      }
      if (!any) { ctx.beginPath(); ctx.arc(cx, cy, cell.w * 0.18, 0, Math.PI * 2); ctx.fillStyle = '#3a4bd6'; ctx.fill(); }
    }
  }

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const val = game.pellets[y][x];
      if (!val) continue;
      const cx = x * cell.w + cell.w / 2, cy = y * cell.h + cell.h / 2;
      if (val === 1) {
        ctx.fillStyle = '#f4e3b0';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, cell.w * 0.09), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const pulse = 0.75 + 0.25 * Math.sin(mouthPhase * 3);
        ctx.fillStyle = '#f4e3b0';
        ctx.beginPath();
        ctx.arc(cx, cy, cell.w * 0.28 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawPac(ctx, cell) {
  const p = game.pac;
  const cx = p.x * cell.w + cell.w / 2, cy = p.y * cell.h + cell.h / 2;
  const r = Math.min(cell.w, cell.h) * 0.42;
  const angle = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[p.dir.name] || 0;
  const mouth = Math.abs(Math.sin(mouthPhase * 8)) * 0.28 + 0.03;
  ctx.fillStyle = '#ffe45a';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, angle + mouth * Math.PI, angle - mouth * Math.PI + Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

function drawGhostBody(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0, false);
  const bottom = cy + r * 0.75;
  ctx.lineTo(cx + r, bottom);
  const teeth = 4;
  for (let i = 0; i < teeth; i++) {
    const x0 = cx + r - (r * 2 * i) / teeth;
    const x1 = cx + r - (r * 2 * (i + 0.5)) / teeth;
    const x2 = cx + r - (r * 2 * (i + 1)) / teeth;
    ctx.lineTo(x1, i % 2 === 0 ? cy + r * 0.35 : bottom);
    ctx.lineTo(x2, bottom);
  }
  ctx.lineTo(cx - r, cy - r * 0.1);
  ctx.closePath();
  ctx.fill();
}

function drawEyes(ctx, cx, cy, r, dir) {
  const off = { up: [0, -0.25], down: [0, 0.25], left: [-0.25, 0], right: [0.25, 0] }[dir.name] || [0, 0];
  for (const s of [-1, 1]) {
    const ex = cx + s * r * 0.42, ey = cy - r * 0.15;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ex, ey, r * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a3a';
    ctx.beginPath(); ctx.arc(ex + off[0] * r * 0.5, ey + off[1] * r * 0.5, r * 0.12, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGhost(ctx, cell, g) {
  const cx = g.x * cell.w + cell.w / 2, cy = g.y * cell.h + cell.h / 2;
  const r = Math.min(cell.w, cell.h) * 0.42;
  if (g.state === 'eaten') { drawEyes(ctx, cx, cy, r, g.dir); return; }
  let color = g.color;
  if (g.state === 'frightened') {
    const flashing = game.frightTimer < 2 && Math.floor(mouthPhase * 6) % 2 === 0;
    color = flashing ? '#f4e3b0' : '#2233dd';
  }
  drawGhostBody(ctx, cx, cy, r, color);
  if (g.state === 'frightened') {
    ctx.fillStyle = '#f4e3b0';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * r * 0.4, cy - r * 0.1, r * 0.13, 0, Math.PI * 2); ctx.fill(); }
  } else {
    drawEyes(ctx, cx, cy, r, g.dir);
  }
}

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  const cell = cellSize(c);
  ctx.clearRect(0, 0, c.width, c.height);
  drawMaze(ctx, cell);
  drawPac(ctx, cell);
  for (const g of game.ghosts) drawGhost(ctx, cell, g);
  if (game.paused && !game.over) {
    ctx.fillStyle = '#00000090';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#e8c469';
    ctx.font = `bold ${Math.round(cell.w * 1.3)}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('READY!', c.width / 2, c.height / 2);
  }
}

function updateHud() {
  $('#score').textContent = game.score;
  $('#best').textContent = game.best;
  $('#lives').textContent = game.lives;
  $('#level').textContent = game.level;
}

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  mouthPhase += dt;

  resizeCanvas();

  if (!game.over) {
    update(game, dt);
    updateHud();
    if (game.win) showWinOverlay();
    else if (game.over) showGameOverOverlay();
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
  sub.textContent = `Score ${game.score}`;
  overlay.appendChild(sub);
  const btn = document.createElement('button');
  btn.textContent = 'Play Again';
  btn.addEventListener('click', restart);
  overlay.appendChild(btn);
}

function showWinOverlay() {
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  overlay.classList.add('show');
  const msg = document.createElement('div');
  msg.className = 'overlay-msg';
  msg.textContent = `Level ${game.level} Complete!`;
  overlay.appendChild(msg);
  const sub = document.createElement('div');
  sub.className = 'overlay-sub';
  sub.textContent = `Score ${game.score}`;
  overlay.appendChild(sub);
  const btn = document.createElement('button');
  btn.textContent = 'Next Level';
  btn.addEventListener('click', () => {
    nextLevel(game);
    overlay.classList.remove('show');
  });
  overlay.appendChild(btn);
}

function restart() {
  game = newGame();
  $('#overlay').classList.remove('show');
  updateHud();
}

const KEY_DIR = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

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
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  updateHud();

  document.addEventListener('keydown', e => {
    const dir = KEY_DIR[e.key];
    if (!dir) return;
    e.preventDefault();
    queueDir(game, dir);
  });

  document.querySelectorAll('.dpad-btn').forEach(btn => {
    bindTap(btn, () => queueDir(game, btn.dataset.dir));
  });

  bindTap($('#new-game-btn'), restart);

  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
