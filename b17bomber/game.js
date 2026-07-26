'use strict';

/* =========================================================================
   B-17 BOMBER — pure engine logic, no DOM. Modeled on the 1981 Mattel
   Intellivision cartridge: a persistent campaign (fly missions until shot
   down or you retire), free targeting of any visible target, four separate
   gunner stations (12/3/6/9 o'clock) each with finite ammo and independently
   knockable-out, and a real-ish flight model (throttle burns fuel, pitch
   trades altitude for airspeed, flying too slow risks a stall). Only the
   Pilot station can change pitch/throttle — you must leave the fight or the
   bombsight to actually fly the plane, same tradeoff the original forces via
   its screen-switching keypad.
   ========================================================================= */

const MIN_ALT = 1, MAX_ALT = 10;
const CLIMB_RATE = 3, DIVE_RATE = 3.5; // altitude units/sec under manual pitch
const STALL_DIVE_RATE = 5; // altitude units/sec lost while stalling (uncontrolled)
const MIN_SPEED = 40, MAX_SPEED = 110;
const STALL_SPEED = 55; // airspeed floor — below this you're stalling
const CLIMB_SPEED_PENALTY = 12; // airspeed lost while climbing
const DIVE_SPEED_GAIN = 12; // airspeed gained while diving
const SPEED_EASE = 1.2; // how fast actual speed chases its throttle/pitch target
const THROTTLE_RATE = 0.5; // per second
const GRAVITY = 9.8;
const AIM_RATE = 1.1; // lateral units/sec, range is -1..1
const HIT_WINDOW = 35;
const LATERAL_HIT_WINDOW = 0.35;
const HP_START = 100;
const BEST_KEY = 'b17bomber-best';

const FUEL_IDLE_BURN = 1; // units/sec at zero throttle
const FUEL_THROTTLE_BURN = 3; // extra units/sec at full throttle
const FUEL_MARGIN = 1.2; // fuel loaded = 20% more than an exact-cruise round trip needs

const MIN_BOMB_LOAD = 1, MAX_BOMB_LOAD = 17;

const NUM_SITES = 5;
const SITE_MIN_DIST = 1800, SITE_MAX_DIST = 4200;
const TARGETS_PER_SITE = [2, 4];
const SITE_NAMES = ['Rouen', 'Lorient', 'Kiel', 'Bremen', 'Schweinfurt', 'Wilhelmshaven', 'Emden', 'St. Nazaire', 'Hamm', 'Munster'];

const FLAK_SAFE_ALT = 5.5; // at/above this altitude, no flak risk
const FLAK_RANGE = 90; // distance window around a live target where flak can occur
const FLAK_DMG = [4, 9];
const FLAK_BOMBSIGHT_DAMAGE_CHANCE = 0.12; // per flak hit while it lands, chance to blur the bombsight

const FRIENDLY_FIRE_RADIUS = 300; // dropping this close to home on either leg is "bombing home turf"
const FRIENDLY_FIRE_PENALTY = 100;

const FIGHTER_APPROACH_TIME = [4.5, 6.5]; // seconds to close from spawn to attack range
const FIGHTER_HP = 0.6;
const FIGHTER_DMG = [12, 20];
const FIGHTER_SPAWN_GAP = [7, 14]; // seconds between fighter spawns, scaled by skill
const FIGHTER_KILL_SCORE = 20;
const STATION_DISABLE_CHANCE = 0.35; // chance a completed fighter attack knocks out the matching gun station

const GUN_BURST_ROUNDS = 10; // one tap/click = one burst = 10 rounds, matching the original
const AMMO_START = 150; // per station (15 bursts)
const GUN_DPS = 2.4;
const GUN_LATERAL_TOL = 0.28;
const BURST_DURATION = 0.35; // seconds a burst's damage window stays open

const SAFE_RETURN_BONUS = 50;

const DIRS = ['N', 'E', 'S', 'W']; // N=12 o'clock (nose), E=3, S=6 (tail), W=9
const DIR_CLOCK = { N: '12', E: '3', S: '6', W: '9' };

const SKILL_LEVELS = [
  { level: 1, name: 'Rookie', bombLoad: 14, fighterMul: 0.55, flakMul: 0.55 },
  { level: 2, name: 'Easy', bombLoad: 11, fighterMul: 0.75, flakMul: 0.75 },
  { level: 3, name: 'Moderate', bombLoad: 8, fighterMul: 1.0, flakMul: 1.0 },
  { level: 4, name: 'Hard', bombLoad: 6, fighterMul: 1.3, flakMul: 1.2 },
  { level: 5, name: 'Ace', bombLoad: 4, fighterMul: 1.6, flakMul: 1.45 },
  { level: 6, name: 'Awesome', bombLoad: 2, fighterMul: 2.0, flakMul: 1.7 },
];

// Free targeting — every visible target is bombable for its own value, no
// locked-in "primary objective". Flak batteries are cheap and plentiful,
// mirroring the original's 1-point-each AA guns.
const TARGET_TYPES = {
  flak_battery: { value: 10, lateralMul: 1.2, icon: '⚡', name: 'Flak Battery', desc: 'Cheap but plentiful.' },
  factory: { value: 30, lateralMul: 1, icon: '\u{1F3ED}', name: 'Factory', desc: 'Standard industrial target.' },
  bridge: { value: 40, lateralMul: 0.5, icon: '\u{1F309}', name: 'Bridge', desc: 'Narrow — precise timing required.' },
  fuel_depot: { value: 40, lateralMul: 1, icon: '⛽', name: 'Fuel Depot', desc: 'Volatile stores, high value.' },
  airfield: { value: 50, lateralMul: 0.85, icon: '\u{1F6E9}️', name: 'Airfield', desc: 'Heavily defended, highest value.' },
};

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

function skillInfo(game) { return SKILL_LEVELS[game.skillLevel - 1]; }

function pickTargetTypesForSite(n) {
  const pool = ['flak_battery', 'flak_battery', 'factory', 'bridge', 'fuel_depot', 'airfield'];
  const list = [];
  for (let i = 0; i < n; i++) list.push(pool[Math.floor(Math.random() * pool.length)]);
  return list;
}

// Home base's strategic map: a fresh board of sites at random headings and
// distances is generated every time you're back at base, so missions never
// repeat exactly. Distance drives both flight time and fuel requirement, so
// farther sites are a real risk/reward call, not just cosmetic.
function generateSites(game) {
  const names = shuffle(SITE_NAMES).slice(0, NUM_SITES);
  game.sites = names.map(name => {
    const distance = rand(SITE_MIN_DIST, SITE_MAX_DIST);
    const angle = rand(0, Math.PI * 2);
    const numTargets = Math.floor(rand(TARGETS_PER_SITE[0], TARGETS_PER_SITE[1] + 1));
    return { id: nextId(), name, angle, distance, targetTypes: pickTargetTypesForSite(numTargets) };
  });
}

function legPositionFor(distance, leg, missionDistance) {
  return leg === 'outbound' ? distance : (2 * missionDistance - distance);
}

function newGunStations() {
  return DIRS.reduce((acc, dir) => { acc[dir] = { dir, ammo: AMMO_START, disabled: false, reticle: 0 }; return acc; }, {});
}

function newGame() {
  const game = {
    phase: 'base', // 'base' | 'flight' | 'campaignOver'
    campaignScore: 0,
    missionsFlown: 0,
    skillLevel: 3,
    bombLoad: SKILL_LEVELS[2].bombLoad,
    best: loadBest(),
    sites: [],
    mission: null,
    pendingSummary: null,
    endReason: null,
    view: 'pilot',
    input: { altUp: false, altDown: false, aimLeft: false, aimRight: false, throttleUp: false, throttleDown: false },
  };
  generateSites(game);
  return game;
}

function setSkillLevel(game, level) {
  if (game.phase !== 'base') return;
  game.skillLevel = clamp(Math.round(level), 1, 6);
  game.bombLoad = skillInfo(game).bombLoad;
}

function setBombLoad(game, n) {
  if (game.phase !== 'base') return;
  game.bombLoad = clamp(Math.round(n), MIN_BOMB_LOAD, MAX_BOMB_LOAD);
}

function setInput(game, partial) { Object.assign(game.input, partial); }

function switchView(game, view) {
  if (game.phase !== 'flight') return false;
  const valid = ['pilot', 'bombardier', 'gun-N', 'gun-E', 'gun-S', 'gun-W'];
  if (!valid.includes(view)) return false;
  game.view = view;
  return true;
}

// Direct positional aim (mouse/touch drag) — routes to whichever reticle the
// active station owns. No-op in the Pilot view (nothing to aim there).
function setAim(game, lateral) {
  const clamped = clamp(lateral, -1, 1);
  if (game.view === 'bombardier') game.aimLateral = clamped;
  else if (game.view.startsWith('gun-')) {
    const st = game.gunStations[game.view.slice(4)];
    if (st) st.reticle = clamped;
  }
}

function fallTime(altitude) { return Math.sqrt((2 * altitude * 10) / GRAVITY); }

function computeFuelMax(mission) {
  const roundTrip = mission.distance * 2;
  const cruiseSpeed = MIN_SPEED + 0.6 * (MAX_SPEED - MIN_SPEED);
  const cruiseTime = roundTrip / cruiseSpeed;
  const burnAtCruise = FUEL_IDLE_BURN + 0.6 * FUEL_THROTTLE_BURN;
  return burnAtCruise * cruiseTime * FUEL_MARGIN;
}

// Takeoff: locks in the chosen site as this mission's destination, lays out
// its targets along the outbound leg, and resets everything a fresh sortie
// needs (fuel/bombs/ammo/hull are restored to full at base between missions).
function startMission(game, siteId) {
  if (game.phase !== 'base') return false;
  const site = game.sites.find(s => s.id === siteId);
  if (!site) return false;

  const margin = 350;
  const usable = Math.max(400, site.distance - margin * 2);
  const gap = usable / site.targetTypes.length;
  const targets = site.targetTypes.map((type, i) => ({
    id: nextId(),
    distance: margin + gap * i + rand(-gap * 0.2, gap * 0.2),
    lateral: rand(-0.8, 0.8),
    destroyed: false,
    type,
  }));

  const mission = { siteId, siteName: site.name, distance: site.distance, targets };
  game.mission = mission;
  game.targets = targets;

  game.distance = 0;
  game.leg = 'outbound';
  game.altitude = 5;
  game.throttle = 0.6;
  game.speed = MIN_SPEED + game.throttle * (MAX_SPEED - MIN_SPEED);
  game.stalling = false;
  game.fuelMax = computeFuelMax(mission);
  game.fuel = game.fuelMax;

  game.bombsLeft = game.bombLoad;
  game.bombsInAir = [];
  game.hp = HP_START;
  game.bombsightDamaged = false;
  game.missionScore = 0;

  game.fighters = [];
  game.fighterSpawnTimer = rand(FIGHTER_SPAWN_GAP[0], FIGHTER_SPAWN_GAP[1]) / skillInfo(game).fighterMul;
  game.gunStations = newGunStations();
  game.burstActive = false;
  game.burstDir = null;
  game.burstTimeLeft = 0;

  game.aimLateral = 0;
  game.view = 'pilot';
  game.elapsed = 0;
  game.events = [];

  game.phase = 'flight';
  return true;
}

function pushEvent(game, type, data) { game.events.push(Object.assign({ type }, data)); }

function dropBomb(game) {
  if (game.phase !== 'flight' || game.view !== 'bombardier' || game.bombsLeft <= 0) return false;
  game.bombsLeft--;
  const ft = fallTime(game.altitude);
  const jitter = game.bombsightDamaged ? rand(-0.15, 0.15) : 0;
  const lateral = clamp(game.aimLateral + jitter, -1, 1);
  game.bombsInAir.push({
    id: nextId(),
    releaseDistance: game.distance,
    releaseLeg: game.leg,
    lateral,
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
  const total = game.mission.distance * 2;
  if (bomb.impactDistance < FRIENDLY_FIRE_RADIUS || bomb.impactDistance > total - FRIENDLY_FIRE_RADIUS) {
    bomb.friendlyFire = true;
    game.missionScore -= FRIENDLY_FIRE_PENALTY;
    pushEvent(game, 'friendlyFire');
    return null;
  }
  const impactLegPos = legPositionFor(bomb.impactDistance, bomb.releaseLeg, game.mission.distance);
  let hitTarget = null;
  for (const t of game.targets) {
    if (t.destroyed) continue;
    const latWindow = LATERAL_HIT_WINDOW * TARGET_TYPES[t.type].lateralMul;
    if (Math.abs(t.distance - impactLegPos) <= HIT_WINDOW && Math.abs(t.lateral - bomb.lateral) <= latWindow) {
      hitTarget = t;
      break;
    }
  }
  if (hitTarget) {
    hitTarget.destroyed = true;
    hitTarget.pointsAwarded = TARGET_TYPES[hitTarget.type].value;
    game.missionScore += hitTarget.pointsAwarded;
    pushEvent(game, 'targetHit', { targetId: hitTarget.id });
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
  const pos = legPositionFor(game.distance, game.leg, game.mission.distance);
  const nearLiveTarget = game.targets.some(t => !t.destroyed && Math.abs(t.distance - pos) <= FLAK_RANGE);
  if (!nearLiveTarget) return;
  const altRisk = (FLAK_SAFE_ALT - game.altitude) / (FLAK_SAFE_ALT - MIN_ALT); // 0..1
  const chancePerSec = 0.35 * altRisk * skillInfo(game).flakMul;
  if (Math.random() < chancePerSec * dt * 10) { // scaled so dt~0.016 gives a sane per-frame probability
    game.hp -= rand(FLAK_DMG[0], FLAK_DMG[1]);
    pushEvent(game, 'flak');
    if (!game.bombsightDamaged && Math.random() < FLAK_BOMBSIGHT_DAMAGE_CHANCE) {
      game.bombsightDamaged = true;
      pushEvent(game, 'bombsightDamaged');
    }
  }
}

function spawnFighter(game) {
  const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
  const baseLateral = rand(-0.9, 0.9);
  game.fighters.push({
    id: nextId(), dir, baseLateral, lateral: baseLateral, weaveVel: 0, closing: 1, hp: FIGHTER_HP,
    approachTime: rand(FIGHTER_APPROACH_TIME[0], FIGHTER_APPROACH_TIME[1]),
    weaveAmp: rand(0.18, 0.4), weaveFreq: rand(0.5, 1.15), weavePhase: rand(0, Math.PI * 2),
  });
}

// Fighters attack from one of the four directions whether or not you're
// watching that station — matching the original's "bandit at 3 o'clock"
// callouts, where switching to the right gun position in time is the game.
function updateFighters(game, dt) {
  const skill = skillInfo(game);
  game.fighterSpawnTimer -= dt;
  if (game.fighterSpawnTimer <= 0) {
    spawnFighter(game);
    pushEvent(game, 'fighterSpawn', { dir: game.fighters[game.fighters.length - 1].dir });
    game.fighterSpawnTimer = rand(FIGHTER_SPAWN_GAP[0], FIGHTER_SPAWN_GAP[1]) / skill.fighterMul;
  }
  for (const f of game.fighters) {
    f.closing -= dt / f.approachTime;
    const t = game.elapsed * f.weaveFreq * Math.PI * 2 + f.weavePhase;
    const envelope = Math.max(0, f.closing); // weave dies out as it commits to the run
    const offset = Math.sin(t) * f.weaveAmp * envelope;
    f.weaveVel = Math.cos(t) * f.weaveAmp * envelope * f.weaveFreq * Math.PI * 2;
    f.lateral = clamp(f.baseLateral + offset, -1.15, 1.15);
    if (f.closing <= 0) {
      f.dead = true;
      game.hp -= rand(FIGHTER_DMG[0], FIGHTER_DMG[1]);
      pushEvent(game, 'fighterAttack', { dir: f.dir });
      const st = game.gunStations[f.dir];
      if (st && !st.disabled && Math.random() < STATION_DISABLE_CHANCE) {
        st.disabled = true;
        pushEvent(game, 'stationDisabled', { dir: f.dir });
      }
    }
  }
  game.fighters = game.fighters.filter(f => !f.dead);
}

// One tap/click fires one 10-round burst from the active station (if it has
// ammo and isn't knocked out); damage is applied over the burst's short
// window against whichever fighter on that station's heading is under the
// reticle when the rounds are in the air.
function fireBurst(game) {
  if (game.phase !== 'flight' || !game.view.startsWith('gun-')) return false;
  const dir = game.view.slice(4);
  const st = game.gunStations[dir];
  if (!st || st.disabled || st.ammo < GUN_BURST_ROUNDS) return false;
  st.ammo -= GUN_BURST_ROUNDS;
  game.burstActive = true;
  game.burstDir = dir;
  game.burstTimeLeft = BURST_DURATION;
  return true;
}

function updateGunBurst(game, dt) {
  if (game.burstTimeLeft > 0) {
    const st = game.gunStations[game.burstDir];
    if (st && !st.disabled) {
      let target = null, bestClosing = -1;
      for (const f of game.fighters) {
        if (f.dir !== game.burstDir) continue;
        if (Math.abs(f.lateral - st.reticle) <= GUN_LATERAL_TOL && f.closing > bestClosing) { bestClosing = f.closing; target = f; }
      }
      if (target) {
        target.hp -= GUN_DPS * dt;
        if (target.hp <= 0) {
          target.dead = true;
          game.missionScore += FIGHTER_KILL_SCORE;
          pushEvent(game, 'fighterKilled', { dir: target.dir });
        }
      }
    }
    game.burstTimeLeft -= dt;
    if (game.burstTimeLeft <= 0) game.burstActive = false;
  }
  game.fighters = game.fighters.filter(f => !f.dead);
}

// Only the Pilot station can touch pitch/throttle — leaving it to bomb or
// fight means the plane holds its current throttle/trim untouched, which is
// exactly the tradeoff the original's single-screen-at-a-time keypad forces.
function updateFlightModel(game, dt) {
  if (game.view === 'pilot') {
    if (game.input.throttleUp) game.throttle = clamp(game.throttle + THROTTLE_RATE * dt, 0, 1);
    if (game.input.throttleDown) game.throttle = clamp(game.throttle - THROTTLE_RATE * dt, 0, 1);
  }
  let pitch = 0;
  if (game.view === 'pilot') {
    if (game.input.altUp) pitch = 1;
    else if (game.input.altDown) pitch = -1;
  }

  const cruiseSpeed = MIN_SPEED + game.throttle * (MAX_SPEED - MIN_SPEED);
  let targetSpeed = cruiseSpeed;
  if (pitch > 0) targetSpeed -= CLIMB_SPEED_PENALTY;
  else if (pitch < 0) targetSpeed += DIVE_SPEED_GAIN;
  targetSpeed = clamp(targetSpeed, MIN_SPEED * 0.35, MAX_SPEED * 1.15);
  const ease = 1 - Math.exp(-SPEED_EASE * dt);
  game.speed += (targetSpeed - game.speed) * ease;

  game.stalling = game.speed < STALL_SPEED;
  if (game.stalling) {
    game.altitude = Math.max(0, game.altitude - STALL_DIVE_RATE * dt);
  } else if (pitch > 0) {
    game.altitude = clamp(game.altitude + CLIMB_RATE * dt, MIN_ALT, MAX_ALT);
  } else if (pitch < 0) {
    game.altitude = clamp(game.altitude - DIVE_RATE * dt, MIN_ALT, MAX_ALT);
  }

  const burn = FUEL_IDLE_BURN + game.throttle * FUEL_THROTTLE_BURN;
  game.fuel = Math.max(0, game.fuel - burn * dt);

  game.distance += game.speed * dt;
}

function updateAim(game, dt) {
  if (game.view === 'bombardier') {
    if (game.input.aimLeft) game.aimLateral = clamp(game.aimLateral - AIM_RATE * dt, -1, 1);
    if (game.input.aimRight) game.aimLateral = clamp(game.aimLateral + AIM_RATE * dt, -1, 1);
  } else if (game.view.startsWith('gun-')) {
    const st = game.gunStations[game.view.slice(4)];
    if (st) {
      if (game.input.aimLeft) st.reticle = clamp(st.reticle - AIM_RATE * 1.4 * dt, -1, 1);
      if (game.input.aimRight) st.reticle = clamp(st.reticle + AIM_RATE * 1.4 * dt, -1, 1);
    }
  }
}

function endMission(game, reason) {
  game.phase = 'campaignOver';
  game.endReason = reason; // 'shotdown' | 'ditched' | 'crashed'
  if (game.campaignScore > game.best) { game.best = game.campaignScore; saveBest(game.best); }
}

// A safe landing banks this mission's score into the permanent campaign
// total (dying mid-mission forfeits whatever wasn't banked yet — real
// incentive to make it home) and rearms/refuels/repairs for the next sortie.
function landSafely(game) {
  const fuelFrac = game.fuelMax > 0 ? game.fuel / game.fuelMax : 0;
  const bonus = SAFE_RETURN_BONUS + Math.round(game.hp * 0.5) + Math.round(fuelFrac * 30);
  game.missionScore += bonus;
  game.campaignScore += game.missionScore;
  game.missionsFlown++;
  if (game.campaignScore > game.best) { game.best = game.campaignScore; saveBest(game.best); }
  game.pendingSummary = {
    siteName: game.mission.siteName,
    missionScore: game.missionScore,
    bonus,
    hp: game.hp,
    bombsUsed: game.bombLoad - game.bombsLeft,
  };
  game.phase = 'base';
  generateSites(game);
}

function ackSummary(game) { game.pendingSummary = null; }

function endCampaign(game) {
  if (game.phase !== 'base') return false;
  game.phase = 'campaignOver';
  game.endReason = 'retired';
  if (game.campaignScore > game.best) { game.best = game.campaignScore; saveBest(game.best); }
  return true;
}

function finalizeIfOver(game) {
  if (game.phase !== 'flight') return;
  if (game.hp <= 0) { game.hp = 0; endMission(game, 'shotdown'); return; }
  if (game.fuel <= 0) { game.fuel = 0; endMission(game, 'ditched'); return; }
  if (game.altitude <= 0) { endMission(game, 'crashed'); return; }
  if (game.leg === 'return' && game.distance >= game.mission.distance * 2) {
    game.distance = game.mission.distance * 2;
    landSafely(game);
  }
}

function update(game, dt) {
  dt = Math.min(dt, 0.05);
  game.events = [];
  if (game.phase !== 'flight') return;
  game.elapsed += dt;

  updateFlightModel(game, dt);
  updateAim(game, dt);
  if (game.leg === 'outbound' && game.distance >= game.mission.distance) game.leg = 'return';

  updateBombs(game);
  updateFlak(game, dt);
  updateFighters(game, dt);
  updateGunBurst(game, dt);

  finalizeIfOver(game);
}
