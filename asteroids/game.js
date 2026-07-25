'use strict';

/* =========================================================================
   ASTEROIDS — pure engine logic, no DOM. Logical world coordinates (not
   pixels); ui.js scales to the canvas. Frictionless inertia (classic
   Asteroids physics: thrust adds velocity, nothing removes it but the
   speed cap), screen wrap, and size-based asteroid splitting.
   ========================================================================= */

const WORLD_W = 1000;
const WORLD_H = 750;
const BEST_KEY = 'asteroids-best';

const SHIP_RADIUS = 14;
const SHIP_ROT_SPEED = 3.6; // rad/sec
const SHIP_THRUST = 240; // px/sec^2
const SHIP_MAX_SPEED = 420; // px/sec
const SHIP_INVULN_TIME = 2.5;
const RESPAWN_DELAY = 1.2;

const BULLET_SPEED = 560;
const BULLET_LIFE = 0.85;
const FIRE_COOLDOWN = 0.22;
const MAX_BULLETS = 6;

const SIZE_INFO = {
  3: { radius: 46, speed: [40, 90], score: 20 },
  2: { radius: 26, speed: [60, 130], score: 50 },
  1: { radius: 14, speed: [90, 180], score: 100 },
};

function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ }
}

function wrap(v, max) { return ((v % max) + max) % max; }
function rand(min, max) { return min + Math.random() * (max - min); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

function makeAsteroid(size, x, y, angleAway) {
  const info = SIZE_INFO[size];
  const speed = rand(info.speed[0], info.speed[1]);
  const dir = angleAway !== undefined ? angleAway + rand(-0.9, 0.9) : rand(0, Math.PI * 2);
  return {
    x, y,
    vx: Math.cos(dir) * speed,
    vy: Math.sin(dir) * speed,
    radius: info.radius,
    size,
    angle: rand(0, Math.PI * 2),
    rotSpeed: rand(-1.5, 1.5),
    seed: Math.floor(rand(0, 1e9)), // stable per-asteroid shape jitter for rendering
  };
}

function spawnWave(game) {
  const count = Math.min(11, 3 + game.wave);
  game.asteroids = [];
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, WORLD_W);
      y = rand(0, WORLD_H);
    } while (dist2(x, y, game.ship.x, game.ship.y) < 220 * 220);
    game.asteroids.push(makeAsteroid(3, x, y));
  }
}

function newGame() {
  const game = {
    score: 0,
    best: loadBest(),
    lives: 3,
    wave: 1,
    over: false,
    respawnTimer: 0,
    ship: {
      x: WORLD_W / 2, y: WORLD_H / 2, angle: -Math.PI / 2,
      vx: 0, vy: 0, thrusting: false, alive: true, invuln: SHIP_INVULN_TIME,
    },
    bullets: [],
    asteroids: [],
    input: { thrust: false, rotateLeft: false, rotateRight: false, firing: false },
    fireCooldown: 0,
  };
  spawnWave(game);
  return game;
}

function setInput(game, partial) {
  Object.assign(game.input, partial);
}

function fireBullet(game) {
  const s = game.ship;
  if (game.bullets.length >= MAX_BULLETS) return;
  const noseX = s.x + Math.cos(s.angle) * SHIP_RADIUS;
  const noseY = s.y + Math.sin(s.angle) * SHIP_RADIUS;
  game.bullets.push({
    x: noseX, y: noseY,
    vx: Math.cos(s.angle) * BULLET_SPEED,
    vy: Math.sin(s.angle) * BULLET_SPEED,
    life: BULLET_LIFE,
  });
}

function updateShip(game, dt) {
  const s = game.ship;
  if (!s.alive) return;
  if (game.input.rotateLeft) s.angle -= SHIP_ROT_SPEED * dt;
  if (game.input.rotateRight) s.angle += SHIP_ROT_SPEED * dt;
  s.thrusting = !!game.input.thrust;
  if (s.thrusting) {
    s.vx += Math.cos(s.angle) * SHIP_THRUST * dt;
    s.vy += Math.sin(s.angle) * SHIP_THRUST * dt;
    const speed = Math.hypot(s.vx, s.vy);
    if (speed > SHIP_MAX_SPEED) {
      s.vx = (s.vx / speed) * SHIP_MAX_SPEED;
      s.vy = (s.vy / speed) * SHIP_MAX_SPEED;
    }
  }
  s.x = wrap(s.x + s.vx * dt, WORLD_W);
  s.y = wrap(s.y + s.vy * dt, WORLD_H);

  if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - dt);

  game.fireCooldown = Math.max(0, game.fireCooldown - dt);
  if (game.input.firing && game.fireCooldown <= 0) {
    fireBullet(game);
    game.fireCooldown = FIRE_COOLDOWN;
  }
}

function updateBullets(game, dt) {
  for (const b of game.bullets) {
    b.x = wrap(b.x + b.vx * dt, WORLD_W);
    b.y = wrap(b.y + b.vy * dt, WORLD_H);
    b.life -= dt;
  }
  game.bullets = game.bullets.filter(b => b.life > 0);
}

function updateAsteroids(game, dt) {
  for (const a of game.asteroids) {
    a.x = wrap(a.x + a.vx * dt, WORLD_W);
    a.y = wrap(a.y + a.vy * dt, WORLD_H);
    a.angle += a.rotSpeed * dt;
  }
}

function splitAsteroid(game, a) {
  if (a.size > 1) {
    const away = Math.atan2(a.vy, a.vx);
    game.asteroids.push(makeAsteroid(a.size - 1, a.x, a.y, away + Math.PI / 2));
    game.asteroids.push(makeAsteroid(a.size - 1, a.x, a.y, away - Math.PI / 2));
  }
}

function handleCollisions(game) {
  // bullets vs asteroids
  for (const b of game.bullets) {
    for (const a of game.asteroids) {
      if (b.life <= 0) break;
      const r = a.radius + 3;
      if (dist2(b.x, b.y, a.x, a.y) < r * r) {
        b.life = -1;
        a.dead = true;
        game.score += SIZE_INFO[a.size].score;
        if (game.score > game.best) { game.best = game.score; saveBest(game.best); }
        splitAsteroid(game, a);
      }
    }
  }
  game.bullets = game.bullets.filter(b => b.life > 0);
  const destroyed = game.asteroids.some(a => a.dead);
  if (destroyed) game.asteroids = game.asteroids.filter(a => !a.dead);

  // ship vs asteroids
  const s = game.ship;
  if (s.alive && s.invuln <= 0) {
    for (const a of game.asteroids) {
      const r = a.radius + SHIP_RADIUS * 0.7;
      if (dist2(s.x, s.y, a.x, a.y) < r * r) {
        killShip(game);
        break;
      }
    }
  }

  if (game.asteroids.length === 0 && !game.over) {
    game.wave++;
    spawnWave(game);
  }
}

function killShip(game) {
  const s = game.ship;
  s.alive = false;
  game.lives--;
  game.bullets = [];
  if (game.lives <= 0) {
    game.over = true;
    return;
  }
  game.respawnTimer = RESPAWN_DELAY;
}

function respawnShip(game) {
  const s = game.ship;
  s.x = WORLD_W / 2; s.y = WORLD_H / 2;
  s.vx = 0; s.vy = 0;
  s.angle = -Math.PI / 2;
  s.invuln = SHIP_INVULN_TIME;
  s.alive = true;
}

function update(game, dt) {
  dt = Math.min(dt, 0.05);
  if (game.over) return;
  if (!game.ship.alive) {
    game.respawnTimer -= dt;
    if (game.respawnTimer <= 0) respawnShip(game);
    updateBullets(game, dt);
    updateAsteroids(game, dt);
    return;
  }
  updateShip(game, dt);
  updateBullets(game, dt);
  updateAsteroids(game, dt);
  handleCollisions(game);
}
