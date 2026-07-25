'use strict';

/* =========================================================================
   PAC-MAN — pure engine/AI logic, no DOM. Tile-unit coordinates: integer
   (x,y) = the center of maze cell (x,y). Entities move continuously through
   fractional coordinates; a while-loop stepper resolves exact tile-center
   crossings each frame (never relies on landing on an exact float), so
   walls/turns are always caught even at low frame rates or high speed.
   ========================================================================= */

const MAZE = [
  '###################',
  '#o#.....#.#.....#o#',
  '#.#.#.#.#.#.#.#.#.#',
  '#.....#.....#.....#',
  '#.#.#.###.###.#.#.#',
  '#.....#.....#.....#',
  '#.###.###.###.###.#',
  '#...#.........#...#',
  '#.#.#.#.#.#.#.#.#.#',
  '#.#...###D###...#.#',
  '#.######   ######.#',
  '..#....#   #....#..',
  '#.###.##   ##.###.#',
  '#.#...#######...#.#',
  '#.#.#####.#####.#.#',
  '#.......#.#.......#',
  '#.#.###.#.#.###.#.#',
  '#.#...#.....#...#.#',
  '#.#####.#.#.#####.#',
  '#.......#.#.......#',
  '#########.#########',
  '#o...............o#',
  '###################',
];

const WIDTH = MAZE[0].length;
const HEIGHT = MAZE.length;
const BEST_KEY = 'pacman-best';
const EPS = 1e-9;

const UP = { x: 0, y: -1, name: 'up' };
const DOWN = { x: 0, y: 1, name: 'down' };
const LEFT = { x: -1, y: 0, name: 'left' };
const RIGHT = { x: 1, y: 0, name: 'right' };
const DIRS = [UP, LEFT, DOWN, RIGHT];

const PAC_SPAWN = { x: 9, y: 17 };
const DOOR = { x: 9, y: 9 };
const HOUSE_ENTRY = { x: 9, y: 8 }; // just outside the door
const HOUSE_CENTER = { x: 9, y: 11 };

const GHOST_DEFS = [
  { id: 'chaser', color: '#ff3b3b', spawn: { x: 9, y: 11 }, scatter: { x: 18, y: -2 }, releaseAt: 0 },
  { id: 'ambusher', color: '#ff9edb', spawn: { x: 8, y: 11 }, scatter: { x: 0, y: -2 }, releaseAt: 3 },
  { id: 'erratic', color: '#ff9e3b', spawn: { x: 10, y: 11 }, scatter: { x: 18, y: 24 }, releaseAt: 6 },
  { id: 'shy', color: '#3bdfe0', spawn: { x: 9, y: 10 }, scatter: { x: 0, y: 24 }, releaseAt: 9 },
];

// scatter/chase schedule, seconds; last phase runs forever
const MODE_SCHEDULE = [
  { mode: 'scatter', dur: 7 },
  { mode: 'chase', dur: 20 },
  { mode: 'scatter', dur: 7 },
  { mode: 'chase', dur: 20 },
  { mode: 'scatter', dur: 5 },
  { mode: 'chase', dur: Infinity },
];

const FRIGHT_DURATION = 8;
const PAC_BASE_SPEED = 6.4;
const GHOST_BASE_SPEED = 5.8;
const GHOST_FRIGHT_SPEED = 3.2;
const GHOST_EATEN_SPEED = 10.5;
const EAT_RADIUS = 0.55;

function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ }
}

function wrapX(x) { return ((x % WIDTH) + WIDTH) % WIDTH; }

function charAt(x, y) {
  const wx = Math.round(wrapX(x));
  if (y < 0 || y >= HEIGHT) return '#';
  return MAZE[y][wx];
}

function isWallFor(isGhost, x, y) {
  const ch = charAt(x, y);
  if (ch === '#') return true;
  if (ch === 'D') return !isGhost;
  return false;
}

function makePelletGrid() {
  const grid = [];
  let total = 0;
  for (let y = 0; y < HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < WIDTH; x++) {
      const ch = MAZE[y][x];
      if (ch === '.') { row.push(1); total++; }
      else if (ch === 'o') { row.push(2); total++; }
      else row.push(0);
    }
    grid.push(row);
  }
  return { grid, total };
}

function newGame() {
  const { grid, total } = makePelletGrid();
  const game = {
    pellets: grid,
    pelletsLeft: total,
    score: 0,
    best: loadBest(),
    lives: 3,
    level: 1,
    over: false,
    win: false,
    paused: false,
    pauseTimer: 0,
    modeIndex: 0,
    modeTimer: 0,
    mode: 'scatter',
    frightTimer: 0,
    comboMultiplier: 1,
    elapsed: 0,
    speedMul: 1,
    pac: {
      x: PAC_SPAWN.x, y: PAC_SPAWN.y, dir: LEFT, nextDir: LEFT, alive: true,
    },
    ghosts: GHOST_DEFS.map(def => makeGhost(def)),
  };
  eatPelletAt(game, PAC_SPAWN.x, PAC_SPAWN.y);
  return game;
}

function makeGhost(def) {
  return {
    id: def.id, color: def.color,
    x: def.spawn.x, y: def.spawn.y, dir: UP,
    scatter: def.scatter,
    releaseAt: def.releaseAt,
    state: 'waiting', // waiting -> exiting -> active <-> frightened -> eaten -> exiting -> active
    roamTarget: { x: def.spawn.x, y: def.spawn.y },
    roamCooldown: 0,
  };
}

function isAligned(e) {
  return Math.abs(e.x - Math.round(e.x)) < 1e-6 && Math.abs(e.y - Math.round(e.y)) < 1e-6;
}
function tileOf(e) { return { x: Math.round(e.x), y: Math.round(e.y) }; }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }
function reverseDir(d) {
  if (d === UP) return DOWN;
  if (d === DOWN) return UP;
  if (d === LEFT) return RIGHT;
  return LEFT;
}

// Moves `e` up to `speed*dt` tiles along its current heading, resolving one
// or more tile-center crossings exactly (never relying on float equality).
// `decide(e)` is invoked every time the entity sits exactly on a tile
// center — it may change e.dir/state and must return true to halt movement
// for this frame (wall ahead) or false to keep going.
function stepEntity(e, dt, speed, decide) {
  let remaining = speed * dt;
  let guard = 0;
  while (remaining > EPS && guard++ < 64) {
    if (isAligned(e)) {
      e.x = Math.round(e.x); e.y = Math.round(e.y);
      if (decide(e)) return;
    }
    const dx = e.dir.x, dy = e.dir.y;
    let dist;
    if (dx !== 0) {
      dist = dx > 0 ? Math.ceil(e.x - EPS) - e.x : e.x - Math.floor(e.x + EPS);
    } else {
      dist = dy > 0 ? Math.ceil(e.y - EPS) - e.y : e.y - Math.floor(e.y + EPS);
    }
    if (dist < EPS) dist = 1;
    const move = Math.min(remaining, dist);
    e.x += dx * move; e.y += dy * move;
    e.x = wrapX(e.x);
    remaining -= move;
    if (move >= dist - EPS) { e.x = Math.round(e.x); e.y = Math.round(e.y); }
  }
}

function eatPelletAt(game, x, y) {
  const wx = Math.round(wrapX(x));
  const val = game.pellets[y] && game.pellets[y][wx];
  if (!val) return;
  game.pellets[y][wx] = 0;
  game.pelletsLeft--;
  if (val === 1) {
    game.score += 10;
  } else if (val === 2) {
    game.score += 50;
    triggerFrightened(game);
  }
  if (game.score > game.best) { game.best = game.score; saveBest(game.best); }
  if (game.pelletsLeft <= 0) { game.win = true; game.over = true; }
}

function triggerFrightened(game) {
  game.frightTimer = FRIGHT_DURATION;
  game.comboMultiplier = 1;
  for (const g of game.ghosts) {
    if (g.state === 'active') {
      g.state = 'frightened';
      g.dir = reverseDir(g.dir);
    }
  }
}

function queueDir(game, dirName) {
  const d = { up: UP, down: DOWN, left: LEFT, right: RIGHT }[dirName];
  if (d) game.pac.nextDir = d;
}

function movePac(game, dt) {
  const p = game.pac;
  stepEntity(p, dt, PAC_BASE_SPEED * game.speedMul, () => {
    eatPelletAt(game, p.x, p.y);
    if (game.over) return true;
    if (p.nextDir && !isWallFor(false, p.x + p.nextDir.x, p.y + p.nextDir.y)) {
      p.dir = p.nextDir;
    }
    return isWallFor(false, p.x + p.dir.x, p.y + p.dir.y);
  });
}

function ghostTarget(game, g) {
  const p = game.pac;
  const pt = tileOf(p);
  if (g.state === 'frightened') return null; // random movement
  if (g.state === 'eaten') return HOUSE_ENTRY;
  if (g.state === 'exiting') return g.y > HOUSE_ENTRY.y - 0.01 ? DOOR : HOUSE_ENTRY;
  if (g.state === 'waiting') return HOUSE_CENTER;
  if (game.mode === 'scatter') return g.scatter;
  // chase mode: personality-specific targeting
  switch (g.id) {
    case 'chaser':
      return pt;
    case 'ambusher': {
      const d = p.dir;
      return { x: pt.x + d.x * 4, y: pt.y + d.y * 4 };
    }
    case 'erratic': {
      const gt = tileOf(g);
      if (g.roamCooldown <= 0 || dist2(gt.x, gt.y, g.roamTarget.x, g.roamTarget.y) < 1) {
        g.roamCooldown = 2 + Math.random() * 2;
        g.roamTarget = Math.random() < 0.35
          ? pt
          : { x: 1 + Math.floor(Math.random() * (WIDTH - 2)), y: 1 + Math.floor(Math.random() * (HEIGHT - 2)) };
      }
      return g.roamTarget;
    }
    case 'shy': {
      const gt = tileOf(g);
      return manhattan(gt.x, gt.y, pt.x, pt.y) > 8 ? pt : g.scatter;
    }
    default:
      return pt;
  }
}

function ghostSpeed(g) {
  if (g.state === 'frightened') return GHOST_FRIGHT_SPEED;
  if (g.state === 'eaten') return GHOST_EATEN_SPEED;
  return GHOST_BASE_SPEED;
}

function moveGhost(game, g, dt) {
  if (g.state === 'waiting') {
    if (game.elapsed >= g.releaseAt) g.state = 'exiting';
    return;
  }
  stepEntity(g, dt, ghostSpeed(g) * game.speedMul, () => {
    if (g.state === 'eaten' && g.x === HOUSE_ENTRY.x && g.y === HOUSE_ENTRY.y) {
      g.state = 'exiting'; g.x = DOOR.x; g.y = DOOR.y;
    } else if (g.state === 'exiting' && g.x === HOUSE_CENTER.x && g.y === HOUSE_ENTRY.y) {
      g.state = game.frightTimer > 0 ? 'frightened' : 'active';
    }
    const canEnter = (x, y) => !isWallFor(true, x, y);
    const reverse = reverseDir(g.dir);
    let opts = DIRS.filter(d => d !== reverse && canEnter(g.x + d.x, g.y + d.y));
    if (opts.length === 0) opts = DIRS.filter(d => canEnter(g.x + d.x, g.y + d.y));
    let chosen;
    if (g.state === 'frightened') {
      chosen = opts[Math.floor(Math.random() * opts.length)];
    } else {
      const target = ghostTarget(game, g) || tileOf(game.pac);
      chosen = opts[0];
      let bestD = Infinity;
      for (const d of opts) {
        const dd = dist2(g.x + d.x, g.y + d.y, target.x, target.y);
        if (dd < bestD) { bestD = dd; chosen = d; }
      }
    }
    g.dir = chosen;
    return false; // ghosts never idle-stop; dead ends still yield a reverse option
  });
}

function handleCollisions(game) {
  const p = game.pac;
  for (const g of game.ghosts) {
    if (g.state !== 'active' && g.state !== 'frightened') continue;
    if (dist2(p.x, p.y, g.x, g.y) < EAT_RADIUS * EAT_RADIUS) {
      if (g.state === 'frightened') {
        g.state = 'eaten';
        game.score += 200 * game.comboMultiplier;
        game.comboMultiplier *= 2;
        if (game.score > game.best) { game.best = game.score; saveBest(game.best); }
      } else {
        loseLife(game);
        return;
      }
    }
  }
}

function loseLife(game) {
  game.lives--;
  if (game.lives <= 0) {
    game.over = true;
    return;
  }
  game.paused = true;
  game.pauseTimer = 1.2;
  resetPositions(game);
}

function resetPositions(game) {
  const p = game.pac;
  p.x = PAC_SPAWN.x; p.y = PAC_SPAWN.y; p.dir = LEFT; p.nextDir = LEFT;
  for (const g of game.ghosts) {
    const def = GHOST_DEFS.find(d => d.id === g.id);
    g.x = def.spawn.x; g.y = def.spawn.y; g.dir = UP;
    g.state = 'waiting';
  }
  game.elapsed = 0;
  game.mode = 'scatter';
  game.modeIndex = 0;
  game.modeTimer = 0;
  game.frightTimer = 0;
}

function advanceGlobalMode(game, dt) {
  if (game.frightTimer > 0) {
    game.frightTimer -= dt;
    if (game.frightTimer <= 0) {
      game.frightTimer = 0;
      for (const g of game.ghosts) if (g.state === 'frightened') g.state = 'active';
    }
    return;
  }
  game.modeTimer += dt;
  const phase = MODE_SCHEDULE[game.modeIndex];
  if (game.modeTimer >= phase.dur) {
    game.modeTimer = 0;
    game.modeIndex = Math.min(game.modeIndex + 1, MODE_SCHEDULE.length - 1);
    const next = MODE_SCHEDULE[game.modeIndex];
    if (next.mode !== game.mode) {
      game.mode = next.mode;
      for (const g of game.ghosts) {
        if (g.state === 'active') g.dir = reverseDir(g.dir);
      }
    }
  } else {
    game.mode = phase.mode;
  }
}

function nextLevel(game) {
  const { grid, total } = makePelletGrid();
  game.pellets = grid;
  game.pelletsLeft = total;
  game.level++;
  game.speedMul = Math.min(1.4, game.speedMul + 0.05);
  game.win = false;
  game.over = false;
  resetPositions(game);
  eatPelletAt(game, PAC_SPAWN.x, PAC_SPAWN.y);
}

function update(game, dt) {
  dt = Math.min(dt, 0.05);
  if (game.over) return;
  if (game.paused) {
    game.pauseTimer -= dt;
    if (game.pauseTimer <= 0) game.paused = false;
    return;
  }
  game.elapsed += dt;
  advanceGlobalMode(game, dt);
  movePac(game, dt);
  if (game.over) return;
  for (const g of game.ghosts) moveGhost(game, g, dt);
  handleCollisions(game);
}
