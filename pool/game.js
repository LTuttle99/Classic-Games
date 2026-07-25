'use strict';

/* =========================================================================
   8-BALL POOL — pure engine logic, no DOM. Logical table coordinates
   (not pixels); ui.js scales to canvas. Equal-mass elastic ball-ball
   collisions, linear friction, rail bounces, and simplified pocket capture.

   Simplifications (documented in README): no spin/english, ball-in-hand on
   a scratch respots the cue ball at a fixed safe spot rather than letting
   the player place it anywhere, and potting the 8-ball on the break is
   always a loss rather than a re-spot.
   ========================================================================= */

const TABLE_W = 800;
const TABLE_H = 400;
const BALL_R = 9;
const POCKET_R = 19;
const DECEL = 260; // friction deceleration, units/sec^2
const MIN_SPEED = 3;
const MAX_SHOT_SPEED = 900;
const RAIL_RESTITUTION = 0.9;
const WINS_KEY = 'pool-wins';

const POCKETS = [
  { x: 0, y: 0 }, { x: TABLE_W / 2, y: 0 }, { x: TABLE_W, y: 0 },
  { x: 0, y: TABLE_H }, { x: TABLE_W / 2, y: TABLE_H }, { x: TABLE_W, y: TABLE_H },
].map(p => ({ ...p, r: POCKET_R }));

function loadWins() { try { return parseInt(localStorage.getItem(WINS_KEY), 10) || 0; } catch (e) { return 0; } }
function saveWins(n) { try { localStorage.setItem(WINS_KEY, String(n)); } catch (e) { /* ignore */ } }

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function ballGroup(id) { if (id === 0) return 'cue'; if (id >= 1 && id <= 7) return 'solid'; if (id === 8) return 'eight'; return 'stripe'; }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rackBalls() {
  const balls = [{ id: 0, x: TABLE_W * 0.25, y: TABLE_H / 2, vx: 0, vy: 0, active: true }];
  const ids = shuffle([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
  const apexX = TABLE_W * 0.72;
  const dx = BALL_R * 2 * 0.866;
  const dy = BALL_R * 2;
  const positions = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      positions.push({ x: apexX + row * dx, y: TABLE_H / 2 + (col - row / 2) * dy });
    }
  }
  const eightIdx = 4; // middle of the 3rd row — classic rack position
  let idPtr = 0;
  for (let i = 0; i < 15; i++) {
    const p = positions[i];
    const id = i === eightIdx ? 8 : ids[idPtr++];
    balls.push({ id, x: p.x, y: p.y, vx: 0, vy: 0, active: true });
  }
  return balls;
}

function newGame() {
  return {
    balls: rackBalls(),
    pockets: POCKETS,
    phase: 'aiming', // aiming -> shooting -> aiming (or gameover)
    turn: 'player',
    playerGroup: null,
    aiGroup: null,
    shotInfo: { firstContact: null, potted: [] },
    over: false,
    winner: null,
    lastFoul: null,
    aiDelay: 0,
    wins: loadWins(),
    shotCount: 0,
  };
}

function cueBall(game) { return game.balls[0]; }

function takeShot(game, angle, speed) {
  if (game.phase !== 'aiming' || game.over) return false;
  const cue = cueBall(game);
  if (!cue.active) return false;
  const s = Math.max(0, Math.min(MAX_SHOT_SPEED, speed));
  cue.vx = Math.cos(angle) * s;
  cue.vy = Math.sin(angle) * s;
  game.shotInfo = { firstContact: null, potted: [] };
  game.phase = 'shooting';
  game.shotCount++;
  return true;
}

function stepPhysics(game, dt) {
  const balls = game.balls.filter(b => b.active);

  for (const b of balls) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      const newSpeed = Math.max(0, speed - DECEL * dt);
      const scale = newSpeed > 0 ? newSpeed / speed : 0;
      b.vx *= scale; b.vy *= scale;
      if (newSpeed < MIN_SPEED) { b.vx = 0; b.vy = 0; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
  }

  for (const b of balls) {
    if (b.x - BALL_R < 0) { b.x = BALL_R; b.vx = Math.abs(b.vx) * RAIL_RESTITUTION; }
    if (b.x + BALL_R > TABLE_W) { b.x = TABLE_W - BALL_R; b.vx = -Math.abs(b.vx) * RAIL_RESTITUTION; }
    if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy) * RAIL_RESTITUTION; }
    if (b.y + BALL_R > TABLE_H) { b.y = TABLE_H - BALL_R; b.vy = -Math.abs(b.vy) * RAIL_RESTITUTION; }
  }

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = BALL_R * 2;
      if (dist > 0 && dist < minDist) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = minDist - dist;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal < 0) {
          a.vx += velAlongNormal * nx; a.vy += velAlongNormal * ny;
          b.vx -= velAlongNormal * nx; b.vy -= velAlongNormal * ny;
          if (a.id === 0 && game.shotInfo.firstContact === null) game.shotInfo.firstContact = b.id;
          if (b.id === 0 && game.shotInfo.firstContact === null) game.shotInfo.firstContact = a.id;
        }
      }
    }
  }

  for (const b of balls) {
    if (!b.active) continue;
    for (const p of game.pockets) {
      if (dist2(b.x, b.y, p.x, p.y) < p.r * p.r) {
        b.active = false; b.vx = 0; b.vy = 0;
        game.shotInfo.potted.push(b.id);
        break;
      }
    }
  }
}

function allStopped(game) {
  return game.balls.every(b => !b.active || (Math.abs(b.vx) < 0.01 && Math.abs(b.vy) < 0.01));
}

function respotCueBall(game) {
  const cue = cueBall(game);
  cue.active = true; cue.vx = 0; cue.vy = 0;
  let x = TABLE_W * 0.25, y = TABLE_H / 2;
  let tries = 0;
  while (tries < 40 && game.balls.some(b => b.active && b.id !== 0 && dist2(x, y, b.x, b.y) < (BALL_R * 2.2) ** 2)) {
    x += BALL_R * 2.2; tries++;
  }
  cue.x = Math.min(x, TABLE_W - BALL_R); cue.y = y;
}

function resolveShot(game) {
  const info = game.shotInfo;
  const currentIsPlayer = game.turn === 'player';
  const myGroupKey = currentIsPlayer ? 'playerGroup' : 'aiGroup';
  const oppGroupKey = currentIsPlayer ? 'aiGroup' : 'playerGroup';
  let myGroup = game[myGroupKey];

  const cueScratched = info.potted.includes(0);
  const eightPotted = info.potted.includes(8);

  if (eightPotted) {
    const myBallsLeft = myGroup ? game.balls.some(b => b.active && ballGroup(b.id) === myGroup) : true;
    const legalWin = !!myGroup && !myBallsLeft && !cueScratched && info.firstContact !== null;
    game.over = true;
    game.phase = 'gameover';
    game.winner = legalWin ? game.turn : (game.turn === 'player' ? 'ai' : 'player');
    if (game.winner === 'player') { game.wins++; saveWins(game.wins); }
    return;
  }

  let foul = false;
  let foulReason = null;
  if (cueScratched) {
    foul = true; foulReason = 'scratch';
  } else if (info.firstContact === null) {
    foul = true; foulReason = 'no contact';
  } else if (myGroup) {
    const groupCleared = !game.balls.some(b => b.active && ballGroup(b.id) === myGroup);
    if (groupCleared) {
      if (info.firstContact !== 8) { foul = true; foulReason = 'must hit 8-ball first'; }
    } else if (ballGroup(info.firstContact) !== myGroup) {
      foul = true; foulReason = 'hit wrong group first';
    }
  } else if (info.firstContact === 8) {
    foul = true; foulReason = 'hit eight-ball first';
  }

  if (!game.playerGroup && !game.aiGroup) {
    const objectPotted = info.potted.find(id => id !== 0 && id !== 8);
    if (objectPotted !== undefined) {
      const g = ballGroup(objectPotted);
      game[myGroupKey] = g;
      game[oppGroupKey] = g === 'solid' ? 'stripe' : 'solid';
      myGroup = g;
    }
  }

  if (cueScratched) respotCueBall(game);

  const pottedOwn = info.potted.some(id => id !== 0 && id !== 8 && myGroup && ballGroup(id) === myGroup);
  const continueTurn = !foul && pottedOwn;

  game.lastFoul = foul ? foulReason : null;
  game.phase = 'aiming';
  if (!continueTurn) game.turn = game.turn === 'player' ? 'ai' : 'player';
  game.aiDelay = game.turn === 'ai' ? 0.7 : 0;
}

function segmentCircleBlocked(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist2(x1, y1, cx, cy) < r * r;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx, py = y1 + t * dy;
  return dist2(px, py, cx, cy) < r * r;
}

function pathClear(game, x1, y1, x2, y2, excludeIds) {
  for (const b of game.balls) {
    if (!b.active || excludeIds.includes(b.id)) continue;
    if (segmentCircleBlocked(x1, y1, x2, y2, b.x, b.y, BALL_R * 1.9)) return false;
  }
  return true;
}

// Ghost-ball geometry: aim the cue ball at the point behind the target ball
// (along the target->pocket line) so the collision sends the target toward
// the pocket. Returns null if the cut angle is unreasonable or the path
// (cue->ghost or target->pocket) is blocked by another ball.
function evaluateShot(game, cue, target, pocket) {
  const dx = pocket.x - target.x, dy = pocket.y - target.y;
  const distTP = Math.hypot(dx, dy);
  if (distTP < 1) return null;
  const dirX = dx / distTP, dirY = dy / distTP;
  const ghostX = target.x - dirX * BALL_R * 2, ghostY = target.y - dirY * BALL_R * 2;
  const distCG = Math.hypot(ghostX - cue.x, ghostY - cue.y);
  if (distCG < 1) return null;
  const aimAngle = Math.atan2(ghostY - cue.y, ghostX - cue.x);

  const shotDirX = (ghostX - cue.x) / distCG, shotDirY = (ghostY - cue.y) / distCG;
  const cosCut = shotDirX * dirX + shotDirY * dirY;
  const cutAngle = Math.acos(Math.max(-1, Math.min(1, cosCut)));
  if (cutAngle > 1.45) return null; // ~83 degrees — too thin to be reliable

  if (!pathClear(game, cue.x, cue.y, ghostX, ghostY, [cue.id, target.id])) return null;
  if (!pathClear(game, target.x, target.y, pocket.x, pocket.y, [target.id])) return null;

  const difficulty = cutAngle * 70 + (distCG + distTP) * 0.35;
  // Speed needed for the target ball to reach the pocket, worked backward through
  // two friction legs: the target's post-impact travel, then (since only the
  // impact-velocity component along the target->pocket normal transfers on a
  // cut) the cue's own pre-impact travel to the ghost-ball point.
  const neededObjSpeed = Math.sqrt(2 * DECEL * distTP) * 1.35;
  const impactSpeed = neededObjSpeed / Math.max(0.25, Math.cos(cutAngle));
  const launchSpeed = Math.sqrt(impactSpeed * impactSpeed + 2 * DECEL * distCG);
  const speed = Math.max(60, Math.min(MAX_SHOT_SPEED, launchSpeed));
  return { angle: aimAngle, speed, difficulty, cutAngle, targetId: target.id, pocket };
}

function chooseAiShot(game) {
  const cue = cueBall(game);
  const group = game.aiGroup;
  let targets;
  if (group) {
    const mine = game.balls.filter(b => b.active && ballGroup(b.id) === group);
    targets = mine.length ? mine : game.balls.filter(b => b.active && b.id === 8);
  } else {
    targets = game.balls.filter(b => b.active && b.id !== 0 && b.id !== 8);
  }
  let best = null;
  for (const target of targets) {
    for (const pocket of game.pockets) {
      const shot = evaluateShot(game, cue, target, pocket);
      if (shot && (!best || shot.difficulty < best.difficulty)) best = shot;
    }
  }
  return best;
}

function aiPlayTurn(game) {
  const shot = chooseAiShot(game);
  if (shot) {
    const jitter = (Math.random() - 0.5) * 0.012;
    takeShot(game, shot.angle + jitter, shot.speed);
    return;
  }
  // fallback when no clean pot is available: bump toward the nearest legal ball
  const cue = cueBall(game);
  const group = game.aiGroup;
  const groupHasBalls = group && game.balls.some(b => b.active && ballGroup(b.id) === group);
  const pool = game.balls.filter(b => b.active && b.id !== 0 && (!group || (groupHasBalls ? ballGroup(b.id) === group : b.id === 8)));
  const fallbackTargets = pool.length ? pool : game.balls.filter(b => b.active && b.id !== 0);
  let nearest = null, nd = Infinity;
  for (const b of fallbackTargets) {
    const d = dist2(cue.x, cue.y, b.x, b.y);
    if (d < nd) { nd = d; nearest = b; }
  }
  if (nearest) {
    const angle = Math.atan2(nearest.y - cue.y, nearest.x - cue.x);
    takeShot(game, angle, MAX_SHOT_SPEED * 0.5);
  }
}

// At high shot speeds a single ~30ms frame step can move a ball 25+ units —
// much more than a ball's radius — letting collisions land several units
// past the true contact point and skewing the bounce/deflection angle away
// from where the ghost-ball aim intended. Subdividing into small fixed
// substeps keeps per-tick movement well under a ball radius so collision
// normals stay accurate regardless of speed.
const PHYSICS_SUBSTEP = 0.004;

function update(game, dt) {
  dt = Math.min(dt, 0.032);
  if (game.phase === 'gameover') return;
  if (game.phase === 'shooting') {
    let remaining = dt;
    while (remaining > 1e-6) {
      const step = Math.min(PHYSICS_SUBSTEP, remaining);
      stepPhysics(game, step);
      remaining -= step;
    }
    if (allStopped(game)) resolveShot(game);
    return;
  }
  if (game.phase === 'aiming' && game.turn === 'ai') {
    if (game.aiDelay > 0) { game.aiDelay -= dt; return; }
    aiPlayTurn(game);
  }
}
