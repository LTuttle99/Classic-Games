'use strict';

/* =========================================================================
   B-17 BOMBER — pure engine logic, no DOM. Intellivision-style dual view:
   Bombardier view (scroll over the ground, aim laterally, drop bombs that
   fall with real lead time so forward travel during the fall must be
   accounted for) and Gunner view (aim/fire at approaching fighters before
   they close to attack range). Flak punishes flying low over live targets.
   ========================================================================= */

const TRACK_LENGTH = 4000; // outbound leg to the target zone
const TOTAL_LENGTH = TRACK_LENGTH * 2; // outbound + return leg home
const MIN_ALT = 1, MAX_ALT = 10;
const ALT_CHANGE_RATE = 3; // units/sec
const MIN_SPEED = 40, MAX_SPEED = 110;
const THROTTLE_RATE = 0.6; // per second
const GRAVITY = 9.8;
const AIM_RATE = 1.1; // lateral units/sec, range is -1..1
const HIT_WINDOW = 35;
const LATERAL_HIT_WINDOW = 0.35;
const BOMBS_START = 16;
const HP_START = 100;
const NUM_TARGETS = 8;
const FLAK_SAFE_ALT = 5.5; // at/above this altitude, no flak risk
const FLAK_RANGE = 90; // distance window around a live target where flak can occur
const FLAK_DMG = [4, 9];
const FIGHTER_APPROACH_TIME = [4.5, 6.5]; // seconds to close from spawn to attack range
const FIGHTER_HP = 3;
const FIGHTER_DMG = [12, 20];
const FIGHTER_SPAWN_GAP = [7, 14]; // seconds between fighter spawns
const GUN_HEAT_PER_SEC = 0.55;
const GUN_COOL_PER_SEC = 0.35;
const GUN_OVERHEAT_RESET = 0.25;
const GUN_DPS = 2.4;
const GUN_LATERAL_TOL = 0.28;
const BEST_KEY = 'b17bomber-best';

// Engines: the B-17's signature damage model. A hit has a chance to knock
// an engine from ok -> smoking -> dead; a smoking engine left burning can
// also die on its own over time. Each dead engine caps max speed, and
// losing all four brings the plane down regardless of remaining hull HP.
const ENGINE_COUNT = 4;
const ENGINE_DAMAGE_CHANCE = 0.35;
const ENGINE_FIRE_SPREAD_PER_SEC = 0.03;
const ENGINE_SPEED_PENALTY = 0.22; // fraction of max speed lost per dead engine

// Mission briefing: the player picks one of these as the primary objective
// before takeoff. Hitting a primary-type target pays double, and clearing
// every target of that type by mission's end pays a completion bonus.
const TARGET_TYPES = {
  factory: { value: 100, lateralMul: 1, icon: '🏭', name: 'Factory', desc: 'Standard industrial target.' },
  bridge: { value: 150, lateralMul: 0.5, icon: '🌉', name: 'Bridge', desc: 'Narrow — precise timing required.' },
  fuel_depot: { value: 130, lateralMul: 1, icon: '⛽', name: 'Fuel Depot', desc: 'Volatile stores, high value.' },
  airfield: { value: 180, lateralMul: 0.85, icon: '🛩️', name: 'Airfield', desc: 'Heavily defended, highest value.' },
};
const PRIMARY_BONUS_MULT = 2;
const PRIMARY_COMPLETE_BONUS = 300;

function loadBest() { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; } }
function saveBest(n) { try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ } }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(min, max) { return min + Math.random() * (max - min); }
let uid = 1;
function nextId() { return uid++; }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Guarantees at least one of every target type appears, so the briefing's
// chosen objective is always actually present in the mission.
function pickTargetTypes(n) {
  const allTypes = Object.keys(TARGET_TYPES);
  const list = allTypes.slice();
  while (list.length < n) list.push(allTypes[Math.floor(Math.random() * allTypes.length)]);
  return shuffle(list).slice(0, n);
}

function generateTargets() {
  const targets = [];
  const margin = 350;
  const usable = TRACK_LENGTH - margin * 2;
  const gap = usable / NUM_TARGETS;
  const types = pickTargetTypes(NUM_TARGETS);
  for (let i = 0; i < NUM_TARGETS; i++) {
    targets.push({
      id: nextId(),
      distance: margin + gap * i + rand(-gap * 0.25, gap * 0.25),
      lateral: rand(-0.75, 0.75),
      destroyed: false,
      type: types[i],
    });
  }
  return targets;
}

function newGame() {
  return {
    distance: 0,
    altitude: 5,
    throttle: 0.6,
    speed: MIN_SPEED + 0.6 * (MAX_SPEED - MIN_SPEED),
    view: 'bombardier',
    aimLateral: 0,
    targets: generateTargets(),
    bombsLeft: BOMBS_START,
    bombsInAir: [],
    hp: HP_START,
    score: 0,
    over: false,
    win: false,
    best: loadBest(),
    fighters: [],
    fighterSpawnTimer: rand(FIGHTER_SPAWN_GAP[0], FIGHTER_SPAWN_GAP[1]),
    gunHeat: 0,
    gunLocked: false,
    gunReticle: 0,
    elapsed: 0,
    input: { altUp: false, altDown: false, aimLeft: false, aimRight: false, throttleUp: false, throttleDown: false, fire: false },
    lastFlakHit: 0,
    briefingDone: false,
    primaryType: null,
    primaryObjectiveComplete: false,
    engines: Array(ENGINE_COUNT).fill('ok'),
    leg: 'outbound',
    crashed: false,
    lastEngineHit: 0,
  };
}

function deadEngineCount(game) { return game.engines.filter(e => e === 'dead').length; }

// A hit has a chance to worsen one engine: an already-smoking engine is
// more likely to be finished off than a fresh one is to start smoking.
function damageEngine(game) {
  const smoking = [];
  const ok = [];
  game.engines.forEach((s, i) => { if (s === 'smoking') smoking.push(i); else if (s === 'ok') ok.push(i); });
  if (smoking.length && Math.random() < 0.5) {
    game.engines[smoking[Math.floor(Math.random() * smoking.length)]] = 'dead';
  } else if (ok.length) {
    game.engines[ok[Math.floor(Math.random() * ok.length)]] = 'smoking';
  } else {
    return;
  }
  game.lastEngineHit = game.elapsed;
}

function updateEngineFires(game, dt) {
  for (let i = 0; i < game.engines.length; i++) {
    if (game.engines[i] === 'smoking' && Math.random() < ENGINE_FIRE_SPREAD_PER_SEC * dt) {
      game.engines[i] = 'dead';
      game.lastEngineHit = game.elapsed;
    }
  }
}

function setInput(game, partial) { Object.assign(game.input, partial); }

// Pre-mission briefing: picks the primary objective type. The mission clock
// (update()) is gated until this is called.
function chooseTarget(game, type) {
  if (!TARGET_TYPES[type] || game.briefingDone) return false;
  game.primaryType = type;
  game.briefingDone = true;
  return true;
}

// Direct positional aim (mouse/touch drag) — sets whichever reticle is
// active for the current view.
function setAim(game, lateral) {
  const clamped = clamp(lateral, -1, 1);
  if (game.view === 'bombardier') game.aimLateral = clamped;
  else game.gunReticle = clamped;
}

function toggleView(game) {
  if (game.over) return;
  game.view = game.view === 'bombardier' ? 'gunner' : 'bombardier';
}

function fallTime(altitude) { return Math.sqrt((2 * altitude * 10) / GRAVITY); }

function dropBomb(game) {
  if (game.over || game.view !== 'bombardier' || game.bombsLeft <= 0) return false;
  game.bombsLeft--;
  const ft = fallTime(game.altitude);
  game.bombsInAir.push({
    id: nextId(),
    releaseDistance: game.distance,
    lateral: game.aimLateral,
    impactDistance: game.distance + game.speed * ft,
    impactTime: game.elapsed + ft,
    fallTime: ft,
    releaseTime: game.elapsed,
    resolved: false,
  });
  return true;
}

function resolveBomb(game, bomb) {
  bomb.resolved = true;
  let hitTarget = null;
  for (const t of game.targets) {
    if (t.destroyed) continue;
    const latWindow = LATERAL_HIT_WINDOW * TARGET_TYPES[t.type].lateralMul;
    if (Math.abs(t.distance - bomb.impactDistance) <= HIT_WINDOW && Math.abs(t.lateral - bomb.lateral) <= latWindow) {
      hitTarget = t;
      break;
    }
  }
  if (hitTarget) {
    hitTarget.destroyed = true;
    const info = TARGET_TYPES[hitTarget.type];
    const isPrimary = hitTarget.type === game.primaryType;
    hitTarget.pointsAwarded = info.value * (isPrimary ? PRIMARY_BONUS_MULT : 1);
    hitTarget.wasPrimary = isPrimary;
    game.score += hitTarget.pointsAwarded;
  }
  return hitTarget;
}

function updateBombs(game) {
  for (const b of game.bombsInAir) {
    if (!b.resolved && game.elapsed >= b.impactTime) resolveBomb(game, b);
  }
  game.bombsInAir = game.bombsInAir.filter(b => !b.resolved || game.elapsed - b.impactTime < 0.6);
}

function updateFlak(game, dt) {
  if (game.altitude >= FLAK_SAFE_ALT) return;
  const nearLiveTarget = game.targets.some(t => !t.destroyed && Math.abs(t.distance - game.distance) <= FLAK_RANGE);
  if (!nearLiveTarget) return;
  const altRisk = (FLAK_SAFE_ALT - game.altitude) / (FLAK_SAFE_ALT - MIN_ALT); // 0..1
  const chancePerSec = 0.35 * altRisk;
  if (Math.random() < chancePerSec * dt * 10) { // scaled so dt~0.016 gives a sane per-frame probability
    game.hp -= rand(FLAK_DMG[0], FLAK_DMG[1]);
    game.lastFlakHit = game.elapsed;
    if (Math.random() < ENGINE_DAMAGE_CHANCE) damageEngine(game);
  }
}

function spawnFighter(game) {
  game.fighters.push({
    id: nextId(), lateral: rand(-0.9, 0.9), closing: 1, hp: FIGHTER_HP,
    approachTime: rand(FIGHTER_APPROACH_TIME[0], FIGHTER_APPROACH_TIME[1]),
  });
}

function updateFighters(game, dt) {
  game.fighterSpawnTimer -= dt;
  if (game.fighterSpawnTimer <= 0) {
    spawnFighter(game);
    game.fighterSpawnTimer = rand(FIGHTER_SPAWN_GAP[0], FIGHTER_SPAWN_GAP[1]);
  }
  for (const f of game.fighters) {
    f.closing -= dt / f.approachTime;
    if (f.closing <= 0) {
      f.dead = true;
      game.hp -= rand(FIGHTER_DMG[0], FIGHTER_DMG[1]);
      if (Math.random() < ENGINE_DAMAGE_CHANCE) damageEngine(game);
    }
  }
  game.fighters = game.fighters.filter(f => !f.dead);
}

function updateGun(game, dt) {
  const firing = game.input.fire && game.view === 'gunner' && !game.gunLocked;
  if (firing) {
    game.gunHeat = Math.min(1, game.gunHeat + GUN_HEAT_PER_SEC * dt);
    if (game.gunHeat >= 1) game.gunLocked = true;
    let target = null, bestClosing = -1;
    for (const f of game.fighters) {
      if (Math.abs(f.lateral - game.gunReticle) <= GUN_LATERAL_TOL && f.closing > bestClosing) { bestClosing = f.closing; target = f; }
    }
    if (target) {
      target.hp -= GUN_DPS * dt;
      if (target.hp <= 0) {
        target.dead = true;
        game.score += 50;
      }
    }
  } else {
    game.gunHeat = Math.max(0, game.gunHeat - GUN_COOL_PER_SEC * dt);
    if (game.gunLocked && game.gunHeat <= GUN_OVERHEAT_RESET) game.gunLocked = false;
  }
  game.fighters = game.fighters.filter(f => !f.dead);
}

function finalizeIfOver(game) {
  if (game.over) return;
  if (deadEngineCount(game) >= ENGINE_COUNT) {
    game.over = true; game.win = false; game.crashed = true;
  } else if (game.hp <= 0) {
    game.hp = 0; game.over = true; game.win = false;
  } else if (game.distance >= TOTAL_LENGTH) {
    game.distance = TOTAL_LENGTH;
    const primaryCleared = !game.targets.some(t => t.type === game.primaryType && !t.destroyed);
    game.primaryObjectiveComplete = primaryCleared;
    if (primaryCleared) game.score += PRIMARY_COMPLETE_BONUS;
    game.score += Math.round(game.hp * 2 + game.bombsLeft * 5);
    game.over = true; game.win = true;
  }
  if (game.over && game.score > game.best) { game.best = game.score; saveBest(game.best); }
}

function update(game, dt) {
  dt = Math.min(dt, 0.05);
  if (game.over || !game.briefingDone) return;
  game.elapsed += dt;

  if (game.input.throttleUp) game.throttle = clamp(game.throttle + THROTTLE_RATE * dt, 0, 1);
  if (game.input.throttleDown) game.throttle = clamp(game.throttle - THROTTLE_RATE * dt, 0, 1);
  const engineSpeedMul = Math.max(0.15, 1 - deadEngineCount(game) * ENGINE_SPEED_PENALTY);
  game.speed = (MIN_SPEED + game.throttle * (MAX_SPEED - MIN_SPEED)) * engineSpeedMul;

  if (game.input.altUp) game.altitude = clamp(game.altitude + ALT_CHANGE_RATE * dt, MIN_ALT, MAX_ALT);
  if (game.input.altDown) game.altitude = clamp(game.altitude - ALT_CHANGE_RATE * dt, MIN_ALT, MAX_ALT);

  if (game.view === 'bombardier') {
    if (game.input.aimLeft) game.aimLateral = clamp(game.aimLateral - AIM_RATE * dt, -1, 1);
    if (game.input.aimRight) game.aimLateral = clamp(game.aimLateral + AIM_RATE * dt, -1, 1);
  } else {
    if (game.input.aimLeft) game.gunReticle = clamp(game.gunReticle - AIM_RATE * 1.4 * dt, -1, 1);
    if (game.input.aimRight) game.gunReticle = clamp(game.gunReticle + AIM_RATE * 1.4 * dt, -1, 1);
  }

  game.distance += game.speed * dt;
  if (game.leg === 'outbound' && game.distance >= TRACK_LENGTH) game.leg = 'return';

  updateBombs(game);
  updateFlak(game, dt);
  updateFighters(game, dt);
  updateGun(game, dt);
  updateEngineFires(game, dt);

  finalizeIfOver(game);
}
