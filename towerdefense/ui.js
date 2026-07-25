'use strict';

let game = newGame();
let lastTime = null;
let selectedType = 'arrow';
let selectedTowerId = null;
let hoverCell = null;

const $ = sel => document.querySelector(sel);
const canvas = () => $('#canvas');

const TOWER_COLORS = { arrow: '#7fd858', cannon: '#e08a3a', frost: '#6cd0ea', sniper: '#c85fe0' };
const ENEMY_COLORS = { grunt: '#d15a4a', runner: '#e0c23a', tank: '#7a4a9a', boss: '#ff3b3b' };

function resizeCanvas() {
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
}

function cellPx(c) { return c.width / GRID_COLS; }

function drawGrid(ctx, c, cell) {
  ctx.fillStyle = '#1c5a2e';
  ctx.fillRect(0, 0, c.width, c.height);

  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      if (BLOCKED_CELLS.has(`${gx},${gy}`)) {
        ctx.fillStyle = '#8a6b45';
        ctx.fillRect(gx * cell, gy * cell, cell, cell);
      }
    }
  }
  ctx.strokeStyle = '#ffffff14';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= GRID_COLS; gx++) { ctx.beginPath(); ctx.moveTo(gx * cell, 0); ctx.lineTo(gx * cell, c.height); ctx.stroke(); }
  for (let gy = 0; gy <= GRID_ROWS; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * cell); ctx.lineTo(c.width, gy * cell); ctx.stroke(); }

  if (hoverCell && !game.over) {
    const buildable = cellBuildable(game, hoverCell.gx, hoverCell.gy);
    ctx.fillStyle = buildable ? '#ffffff33' : '#ff444440';
    ctx.fillRect(hoverCell.gx * cell, hoverCell.gy * cell, cell, cell);
  }
}

function drawTower(ctx, cell, t) {
  const cx = t.x * cell, cy = t.y * cell, r = cell * 0.32;
  if (t.id === selectedTowerId) {
    const stats = towerStats(t);
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, stats.range * cell, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.arc(cx, cy, r + cell * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = TOWER_COLORS[t.type];
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffffdd';
  ctx.font = `bold ${Math.max(8, cell * 0.28)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(t.level), cx, cy + 0.5);
  if (t.id === selectedTowerId) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r + cell * 0.14, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawEnemy(ctx, cell, e) {
  const cx = e.x * cell, cy = e.y * cell;
  const r = cell * (e.type === 'boss' ? 0.4 : e.type === 'tank' ? 0.34 : 0.24);
  ctx.fillStyle = e.slowTimer > 0 ? '#8fd0ff' : ENEMY_COLORS[e.type];
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#00000055'; ctx.lineWidth = 1.5; ctx.stroke();
  const barW = r * 2.2, barH = Math.max(2, cell * 0.06);
  const pct = Math.max(0, e.hp / e.maxHp);
  ctx.fillStyle = '#00000080';
  ctx.fillRect(cx - barW / 2, cy - r - barH * 2, barW, barH);
  ctx.fillStyle = pct > 0.5 ? '#7fd858' : pct > 0.2 ? '#e0c23a' : '#d1332e';
  ctx.fillRect(cx - barW / 2, cy - r - barH * 2, barW * pct, barH);
}

function drawProjectile(ctx, cell, p) {
  ctx.fillStyle = p.splash > 0 ? '#ffb347' : p.slow ? '#bfeaff' : '#ffe45a';
  ctx.beginPath(); ctx.arc(p.x * cell, p.y * cell, Math.max(2, cell * 0.06), 0, Math.PI * 2); ctx.fill();
}

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  const cell = cellPx(c);
  drawGrid(ctx, c, cell);
  for (const t of game.towers) drawTower(ctx, cell, t);
  for (const e of game.enemies) drawEnemy(ctx, cell, e);
  for (const p of game.projectiles) drawProjectile(ctx, cell, p);
}

function updateHud() {
  $('#currency').textContent = game.currency;
  $('#lives').textContent = game.lives;
  $('#wave').textContent = game.wave;
  $('#best').textContent = game.bestWave;
  const waveBtn = $('#wave-btn');
  waveBtn.disabled = game.waveActive || game.over;
  waveBtn.textContent = game.waveActive ? 'Wave in progress…' : `Start Wave ${game.wave + 1}`;

  document.querySelectorAll('.tower-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === selectedType);
    const cost = TOWER_TYPES[btn.dataset.type].cost;
    btn.disabled = game.currency < cost;
  });

  const info = $('#selected-info');
  const tower = game.towers.find(t => t.id === selectedTowerId);
  info.innerHTML = '';
  if (tower) {
    const stats = towerStats(tower);
    const label = document.createElement('span');
    label.textContent = `${tower.type} Lv${tower.level} — dmg ${stats.dmg.toFixed(1)}, range ${stats.range.toFixed(1)}`;
    info.appendChild(label);
    if (tower.level < MAX_LEVEL) {
      const cost = upgradeCost(tower);
      const btn = document.createElement('button');
      btn.textContent = `Upgrade (${cost}g)`;
      btn.disabled = game.currency < cost;
      btn.addEventListener('click', () => { upgradeTower(game, tower.id); updateHud(); });
      info.appendChild(btn);
    } else {
      const maxed = document.createElement('span');
      maxed.textContent = '(max level)';
      maxed.style.opacity = '0.7';
      info.appendChild(maxed);
    }
  } else {
    info.textContent = `Selected: ${selectedType} (${TOWER_TYPES[selectedType].cost}g)`;
  }
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
  msg.textContent = 'Base Overrun';
  overlay.appendChild(msg);
  const sub = document.createElement('div');
  sub.className = 'overlay-sub';
  sub.textContent = `Reached wave ${game.wave} — Best: ${game.bestWave}`;
  overlay.appendChild(sub);
  const btn = document.createElement('button');
  btn.textContent = 'Play Again';
  btn.addEventListener('click', restart);
  overlay.appendChild(btn);
}

function restart() {
  game = newGame();
  selectedTowerId = null;
  $('#overlay').classList.remove('show');
  updateHud();
}

function gridCellFromEvent(e) {
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const cell = cellPx(c);
  const px = (e.clientX - rect.left) * (c.width / rect.width);
  const py = (e.clientY - rect.top) * (c.height / rect.height);
  return { gx: Math.floor(px / cell), gy: Math.floor(py / cell) };
}

function onCanvasPointerDown(e) {
  if (game.over) return;
  e.preventDefault();
  const { gx, gy } = gridCellFromEvent(e);
  if (gx < 0 || gy < 0 || gx >= GRID_COLS || gy >= GRID_ROWS) return;
  const existing = game.towers.find(t => t.gx === gx && t.gy === gy);
  if (existing) {
    selectedTowerId = existing.id;
  } else {
    if (placeTower(game, gx, gy, selectedType)) selectedTowerId = null;
  }
  updateHud();
}
function onCanvasPointerMove(e) {
  hoverCell = gridCellFromEvent(e);
}

function bindTap(el, action) {
  let handledByPointer = false;
  el.addEventListener('pointerdown', ev => { ev.preventDefault(); handledByPointer = true; action(); });
  el.addEventListener('click', () => {
    if (handledByPointer) { handledByPointer = false; return; }
    action();
  });
}

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  updateHud();

  const c = canvas();
  c.addEventListener('pointerdown', onCanvasPointerDown);
  c.addEventListener('pointermove', onCanvasPointerMove);
  c.addEventListener('pointerleave', () => { hoverCell = null; });

  document.querySelectorAll('.tower-btn').forEach(btn => {
    bindTap(btn, () => { selectedType = btn.dataset.type; selectedTowerId = null; updateHud(); });
  });

  bindTap($('#wave-btn'), () => { startWave(game); updateHud(); });
  bindTap($('#new-game-btn'), restart);

  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
