'use strict';

/* =========================================================================
   TOWER DEFENSE — pure engine logic, no DOM. Grid coordinates (not pixels);
   ui.js scales to canvas. Enemies follow a fixed serpentine route computed
   once at load (waypoint interpolation along cumulative segment lengths —
   the "pathfinding" for this scope: towers may not be placed on route
   cells, so the route itself never needs to be recomputed mid-game).
   ========================================================================= */

const GRID_COLS = 14;
const GRID_ROWS = 8;
const BEST_KEY = 'towerdefense-best-wave';

const WAYPOINTS = [
  { x: -0.5, y: 1.5 },
  { x: 13.5, y: 1.5 },
  { x: 13.5, y: 3.5 },
  { x: 0.5, y: 3.5 },
  { x: 0.5, y: 5.5 },
  { x: 13.5, y: 5.5 },
  { x: 13.5, y: 7.5 },
];

function buildPathMeta(waypoints) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return { segs, total };
}
const PATH_META = buildPathMeta(WAYPOINTS);

function pointAtDistance(dist) {
  dist = Math.max(0, Math.min(PATH_META.total, dist));
  for (const s of PATH_META.segs) {
    if (dist <= s.start + s.len + 1e-9) {
      const t = s.len > 0 ? (dist - s.start) / s.len : 0;
      const ct = Math.max(0, Math.min(1, t));
      return { x: s.a.x + (s.b.x - s.a.x) * ct, y: s.a.y + (s.b.y - s.a.y) * ct };
    }
  }
  const last = PATH_META.segs[PATH_META.segs.length - 1];
  return { x: last.b.x, y: last.b.y };
}

function computeBlockedCells() {
  const blocked = new Set();
  for (const s of PATH_META.segs) {
    if (s.a.x === s.b.x) {
      const x = Math.floor(s.a.x);
      const y0 = Math.floor(Math.min(s.a.y, s.b.y));
      const y1 = Math.floor(Math.max(s.a.y, s.b.y));
      for (let y = y0; y <= y1; y++) blocked.add(`${x},${y}`);
    } else {
      const y = Math.floor(s.a.y);
      const x0 = Math.floor(Math.min(s.a.x, s.b.x));
      const x1 = Math.floor(Math.max(s.a.x, s.b.x));
      for (let x = x0; x <= x1; x++) blocked.add(`${x},${y}`);
    }
  }
  return blocked;
}
const BLOCKED_CELLS = computeBlockedCells();

const TOWER_TYPES = {
  arrow: { cost: 50, dmg: 9, range: 3.2, fireRate: 2.2, projectileSpeed: 11, splash: 0 },
  cannon: { cost: 90, dmg: 24, range: 2.6, fireRate: 0.85, projectileSpeed: 7, splash: 1.1 },
  frost: { cost: 70, dmg: 4, range: 2.8, fireRate: 1.4, projectileSpeed: 9, splash: 0, slow: 0.5, slowDur: 1.5 },
  sniper: { cost: 130, dmg: 60, range: 6, fireRate: 0.5, projectileSpeed: 16, splash: 0 },
};
const MAX_LEVEL = 3;
const UPGRADE_STAT_MUL = 1.35;

const ENEMY_TYPES = {
  grunt: { hpBase: 26, hpPerWave: 5, speed: 1.15, reward: 5, lifeDamage: 1 },
  runner: { hpBase: 16, hpPerWave: 3.5, speed: 2.0, reward: 6, lifeDamage: 1 },
  tank: { hpBase: 85, hpPerWave: 16, speed: 0.65, reward: 14, lifeDamage: 2 },
  boss: { hpBase: 400, hpPerWave: 60, speed: 0.5, reward: 60, lifeDamage: 5 },
};

function loadBest() { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; } }
function saveBest(n) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ } }

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
let uid = 1;
function nextId() { return uid++; }

function buildWaveQueue(wave) {
  const queue = [];
  if (wave % 5 === 0) queue.push('boss');
  const gruntCount = 4 + Math.floor(wave * 1.1);
  for (let i = 0; i < gruntCount; i++) queue.push('grunt');
  if (wave >= 2) { const n = 2 + Math.floor(wave * 0.7); for (let i = 0; i < n; i++) queue.push('runner'); }
  if (wave >= 3) { const n = 1 + Math.floor(wave * 0.4); for (let i = 0; i < n; i++) queue.push('tank'); }
  // interleave roughly by shuffling in a stable, deterministic-ish way (simple riffle)
  return riffleShuffle(queue, wave);
}

function riffleShuffle(arr, seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const rand = () => { s = (s * 1103515245 + 12345) >>> 0; return (s % 10000) / 10000; };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newGame() {
  return {
    towers: [],
    enemies: [],
    projectiles: [],
    currency: 150,
    lives: 20,
    wave: 0,
    waveActive: false,
    spawnQueue: [],
    spawnTimer: 0,
    bestWave: loadBest(),
    over: false,
  };
}

function cellKey(gx, gy) { return `${gx},${gy}`; }
function cellBuildable(game, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= GRID_COLS || gy >= GRID_ROWS) return false;
  if (BLOCKED_CELLS.has(cellKey(gx, gy))) return false;
  return !game.towers.some(t => t.gx === gx && t.gy === gy);
}

function placeTower(game, gx, gy, type) {
  if (game.over) return false;
  const def = TOWER_TYPES[type];
  if (!def) return false;
  if (!cellBuildable(game, gx, gy)) return false;
  if (game.currency < def.cost) return false;
  game.currency -= def.cost;
  game.towers.push({
    id: nextId(), gx, gy, type, level: 1, cooldown: 0,
    x: gx + 0.5, y: gy + 0.5,
  });
  return true;
}

function towerStats(tower) {
  const base = TOWER_TYPES[tower.type];
  const mul = Math.pow(UPGRADE_STAT_MUL, tower.level - 1);
  return {
    dmg: base.dmg * mul,
    range: base.range * (1 + 0.12 * (tower.level - 1)),
    fireRate: base.fireRate * (1 + 0.15 * (tower.level - 1)),
    projectileSpeed: base.projectileSpeed,
    splash: base.splash,
    slow: base.slow, slowDur: base.slowDur,
  };
}

function upgradeCost(tower) {
  const base = TOWER_TYPES[tower.type].cost;
  return Math.round(base * 0.75 * tower.level);
}

function upgradeTower(game, towerId) {
  const t = game.towers.find(t => t.id === towerId);
  if (!t || t.level >= MAX_LEVEL) return false;
  const cost = upgradeCost(t);
  if (game.currency < cost) return false;
  game.currency -= cost;
  t.level++;
  return true;
}

function startWave(game) {
  if (game.over || game.waveActive) return false;
  game.wave++;
  game.spawnQueue = buildWaveQueue(game.wave);
  game.spawnTimer = 0;
  game.waveActive = true;
  return true;
}

function spawnInterval(wave) { return Math.max(0.32, 0.9 - wave * 0.02); }

function spawnEnemy(game, type) {
  const def = ENEMY_TYPES[type];
  const hp = def.hpBase + def.hpPerWave * game.wave;
  game.enemies.push({
    id: nextId(), type, traveled: 0, speed: def.speed, hp, maxHp: hp,
    reward: def.reward, lifeDamage: def.lifeDamage, slowTimer: 0, active: true,
    x: WAYPOINTS[0].x, y: WAYPOINTS[0].y,
  });
}

function moveEnemies(game, dt) {
  for (const e of game.enemies) {
    if (!e.active) continue;
    if (e.slowTimer > 0) e.slowTimer -= dt;
    const speedMul = e.slowTimer > 0 ? e.slowFactor : 1;
    e.traveled += e.speed * speedMul * dt;
    if (e.traveled >= PATH_META.total) {
      e.active = false;
      game.lives -= e.lifeDamage;
      continue;
    }
    const p = pointAtDistance(e.traveled);
    e.x = p.x; e.y = p.y;
  }
  game.enemies = game.enemies.filter(e => e.active);
  if (game.lives <= 0) { game.lives = 0; game.over = true; }
}

function pickTarget(game, tower, range) {
  let best = null, bestProg = -1;
  for (const e of game.enemies) {
    if (!e.active) continue;
    if (dist2(tower.x, tower.y, e.x, e.y) > range * range) continue;
    if (e.traveled > bestProg) { bestProg = e.traveled; best = e; }
  }
  return best;
}

function fireTower(game, tower, stats) {
  const target = pickTarget(game, tower, stats.range);
  if (!target) return;
  const dx = target.x - tower.x, dy = target.y - tower.y;
  const dist = Math.hypot(dx, dy) || 1;
  game.projectiles.push({
    id: nextId(), x: tower.x, y: tower.y,
    vx: (dx / dist) * stats.projectileSpeed, vy: (dy / dist) * stats.projectileSpeed,
    targetX: target.x, targetY: target.y, targetId: target.id,
    dmg: stats.dmg, splash: stats.splash, slow: stats.slow, slowDur: stats.slowDur,
    life: 3,
  });
  tower.cooldown = 1 / stats.fireRate;
}

function updateTowers(game, dt) {
  for (const t of game.towers) {
    if (t.cooldown > 0) t.cooldown -= dt;
    const stats = towerStats(t);
    if (t.cooldown <= 0) fireTower(game, t, stats);
  }
}

function applyDamage(game, enemy, dmg) {
  enemy.hp -= dmg;
  if (enemy.hp <= 0 && enemy.active) {
    enemy.active = false;
    game.currency += enemy.reward;
  }
}

function updateProjectiles(game, dt) {
  for (const p of game.projectiles) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const arrived = dist2(p.x, p.y, p.targetX, p.targetY) < 0.06 || p.life <= 0;
    if (arrived) {
      p.dead = true;
      if (p.splash > 0) {
        for (const e of game.enemies) {
          if (!e.active) continue;
          if (dist2(e.x, e.y, p.targetX, p.targetY) <= p.splash * p.splash) applyDamage(game, e, p.dmg);
        }
      } else {
        const target = game.enemies.find(e => e.id === p.targetId && e.active);
        if (target) {
          applyDamage(game, target, p.dmg);
          if (p.slow && target.active) { target.slowTimer = p.slowDur; target.slowFactor = p.slow; }
        }
      }
    }
  }
  game.projectiles = game.projectiles.filter(p => !p.dead);
  game.enemies = game.enemies.filter(e => e.active);
}

function updateSpawning(game, dt) {
  if (!game.waveActive) return;
  game.spawnTimer -= dt;
  while (game.spawnQueue.length && game.spawnTimer <= 0) {
    spawnEnemy(game, game.spawnQueue.shift());
    game.spawnTimer += spawnInterval(game.wave);
  }
  if (game.spawnQueue.length === 0 && game.enemies.length === 0) {
    game.waveActive = false;
    if (game.wave > game.bestWave) { game.bestWave = game.wave; saveBest(game.bestWave); }
    game.currency += 20 + game.wave * 2;
  }
}

function update(game, dt) {
  dt = Math.min(dt, 0.05);
  if (game.over) return;
  updateSpawning(game, dt);
  moveEnemies(game, dt);
  if (game.over) return;
  updateTowers(game, dt);
  updateProjectiles(game, dt);
}
