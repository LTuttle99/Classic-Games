'use strict';

let game = newGame();
let lastTime = null;
const VIEW_RANGE = 600;
const STATION_ORDER = ['pilot', 'bombardier', 'gun-N', 'gun-E', 'gun-S', 'gun-W'];
const STATION_LABEL = { pilot: 'PILOT', bombardier: 'BOMBARDIER', 'gun-N': 'NOSE GUN (12)', 'gun-E': 'RIGHT GUN (3)', 'gun-S': 'TAIL GUN (6)', 'gun-W': 'LEFT GUN (9)' };
const DIR_PAN = { N: 0, E: 0.8, S: 0, W: -0.8 };

const $ = sel => document.querySelector(sel);
const canvas = () => $('#canvas');

/* ---------------------------- sound (WebAudio, procedural — no assets) --------------------------- */

let audioCtx = null;
let soundOn = (() => { try { return localStorage.getItem('b17bomber-muted') !== '1'; } catch (e) { return true; } })();
function ensureAudio() {
  if (!soundOn) return null;
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beep({ freq = 440, dur = 0.15, type = 'sine', vol = 0.2, sweep = null, delay = 0, pan = null }) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  if (pan !== null && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(clamp(pan, -1, 1), t0);
    gain.connect(panner); panner.connect(ctx.destination);
  } else {
    gain.connect(ctx.destination);
  }
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function noiseBurst({ dur = 0.2, vol = 0.3, delay = 0, pan = null }) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const size = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
  src.connect(gain);
  if (pan !== null && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(clamp(pan, -1, 1), ctx.currentTime + delay);
    gain.connect(panner); panner.connect(ctx.destination);
  } else {
    gain.connect(ctx.destination);
  }
  src.start(ctx.currentTime + delay);
}
const SFX = {
  click: () => beep({ freq: 700, dur: 0.05, vol: 0.12 }),
  dropBomb: () => beep({ freq: 500, sweep: 160, dur: 0.5, type: 'sine', vol: 0.14 }),
  hitTarget: () => { noiseBurst({ dur: 0.35, vol: 0.32 }); beep({ freq: 160, sweep: 50, dur: 0.3, type: 'triangle', vol: 0.16, delay: 0.02 }); },
  gunBurst: (pan) => { for (let i = 0; i < 3; i++) noiseBurst({ dur: 0.05, vol: 0.15, delay: i * 0.06, pan }); },
  ammoEmpty: () => beep({ freq: 600, dur: 0.06, vol: 0.1, type: 'square' }),
  fighterKill: () => { noiseBurst({ dur: 0.3, vol: 0.28 }); beep({ freq: 240, sweep: 70, dur: 0.3, type: 'sawtooth', vol: 0.12, delay: 0.02 }); },
  planeHit: (pan) => beep({ freq: 180, sweep: 90, dur: 0.3, type: 'square', vol: 0.22, pan }),
  flak: () => beep({ freq: 130, sweep: 55, dur: 0.22, type: 'square', vol: 0.2 }),
  bombsightDamage: () => beep({ freq: 320, sweep: 110, dur: 0.35, type: 'sawtooth', vol: 0.16 }),
  stationDown: (pan) => { beep({ freq: 200, sweep: 70, dur: 0.4, type: 'square', vol: 0.2, pan }); noiseBurst({ dur: 0.25, vol: 0.16, delay: 0.05, pan }); },
  stall: () => beep({ freq: 200, sweep: 90, dur: 0.5, type: 'triangle', vol: 0.18 }),
  friendlyFire: () => beep({ freq: 500, sweep: 140, dur: 0.4, type: 'square', vol: 0.2 }),
  missionComplete: () => { beep({ freq: 440, dur: 0.15, vol: 0.2 }); beep({ freq: 660, dur: 0.2, vol: 0.2, delay: 0.15 }); beep({ freq: 880, dur: 0.32, vol: 0.22, delay: 0.32 }); },
  shotDown: () => beep({ freq: 260, sweep: 50, dur: 1.1, type: 'sawtooth', vol: 0.18 }),
  crashed: () => { beep({ freq: 200, sweep: 30, dur: 1.4, type: 'sawtooth', vol: 0.2 }); noiseBurst({ dur: 0.6, vol: 0.3, delay: 0.9 }); },
  ditched: () => { beep({ freq: 220, sweep: 40, dur: 1.0, type: 'sawtooth', vol: 0.18 }); noiseBurst({ dur: 0.7, vol: 0.28, delay: 0.3 }); },
  fighterSpawn: (pan) => { beep({ freq: 520, sweep: 720, dur: 0.16, type: 'triangle', vol: 0.15, pan }); beep({ freq: 520, sweep: 720, dur: 0.16, type: 'triangle', vol: 0.15, delay: 0.2, pan }); },
};

function setSoundOn(on) {
  soundOn = on;
  try { localStorage.setItem('b17bomber-muted', on ? '0' : '1'); } catch (e) { /* ignore */ }
  $('#sound-btn').classList.toggle('muted', !on);
  $('#sound-btn').textContent = on ? '\u{1F50A}' : '\u{1F507}';
}

/* ---------------------- visual effects: particles, shake, flash, vignette ---------------------- */

let particles = [];
let shakeTime = 0, shakeMag = 0;
let flashAlpha = 0;
let pilotTiltVisual = 0;
const explodedTargetIds = new Set();

function spawnBurst(x, y, opts) {
  const { count = 16, colors = ['#ffcf6e', '#ff8a3c', '#ff4a2c'], speed = [60, 220], size = [2, 5], life = [0.35, 0.7], gravity = 0 } = opts;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = rand(speed[0], speed[1]);
    const lifeVal = rand(life[0], life[1]);
    particles.push({
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      size: rand(size[0], size[1]), color: colors[Math.floor(Math.random() * colors.length)],
      life: lifeVal, maxLife: lifeVal, gravity,
    });
  }
}

function triggerShake(mag, dur = 0.25) {
  shakeMag = Math.max(shakeMag, mag);
  shakeTime = Math.max(shakeTime, dur);
}

function triggerFlash(alpha) { flashAlpha = Math.max(flashAlpha, alpha); }

function updateEffects(dt) {
  for (const p of particles) {
    p.vy += p.gravity * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
  if (shakeTime > 0) { shakeTime -= dt; if (shakeTime <= 0) shakeMag = 0; }
  if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 3);
  if (game.phase === 'flight') {
    const target = game.view === 'pilot' ? (game.input.altUp ? 1 : game.input.altDown ? -1 : 0) : 0;
    pilotTiltVisual += (target - pilotTiltVisual) * Math.min(1, dt * 6);
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawDamageVignette(ctx, c) {
  const dmg = 1 - clamp(game.hp / HP_START, 0, 1);
  if (dmg <= 0) return;
  const grad = ctx.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.25, c.width / 2, c.height / 2, c.height * 0.7);
  grad.addColorStop(0, 'rgba(180,0,0,0)');
  grad.addColorStop(1, `rgba(180,0,0,${(dmg * 0.55).toFixed(2)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
}

function drawFlash(ctx, c) {
  if (flashAlpha <= 0) return;
  ctx.fillStyle = `rgba(255,80,60,${flashAlpha.toFixed(2)})`;
  ctx.fillRect(0, 0, c.width, c.height);
}

function drawMuzzleFlash(ctx, c, reticle) {
  const rx = screenX(c, reticle);
  const ry = c.height * 0.4;
  const gunX = c.width / 2, gunY = c.height * 0.95;
  const grad = ctx.createLinearGradient(gunX, gunY, rx, ry);
  grad.addColorStop(0, 'rgba(255,230,150,0.9)');
  grad.addColorStop(1, 'rgba(255,230,150,0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2 + Math.random() * 1.5;
  ctx.beginPath(); ctx.moveTo(gunX, gunY); ctx.lineTo(rx, ry); ctx.stroke();
  ctx.fillStyle = 'rgba(255,220,120,0.9)';
  ctx.beginPath(); ctx.arc(gunX, gunY, 6 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
}

function checkTargetExplosions(c, pos) {
  for (const t of game.targets) {
    if (!t.destroyed || explodedTargetIds.has(t.id)) continue;
    explodedTargetIds.add(t.id);
    if (game.view !== 'bombardier') continue;
    const rd = aheadDistance(t.distance, pos, game.leg);
    if (rd < -200 || rd > VIEW_RANGE + 100) continue;
    const frac = Math.max(0, Math.min(1, rd / VIEW_RANGE));
    const y = c.height * (0.92 - frac * 0.8);
    const x = screenX(c, t.lateral);
    spawnBurst(x, y, { count: 26, colors: ['#ffcf6e', '#ff8a3c', '#c23b1e', '#3a3a3a'], speed: [40, 180], size: [3, 7], life: [0.4, 0.9], gravity: 40 });
    triggerShake(4, 0.2);
  }
}

function activeStationDir() { return game.view.startsWith('gun-') ? game.view.slice(4) : null; }

function captureFighterScreenState(c) {
  const dir = activeStationDir();
  if (!dir) return [];
  return game.fighters.filter(f => f.dir === dir).map(f => {
    const closeness = 1 - f.closing;
    return { id: f.id, x: screenX(c, f.lateral), y: c.height * (0.4 - closeness * 0.05) };
  });
}

/* ---------------------------------------- rendering ---------------------------------------- */

function resizeCanvas() {
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
}

function screenX(c, lateral) { return c.width * (0.5 + lateral * 0.42); }

// leg-relative "how far ahead" a position is from the plane's current spot —
// positive shrinks toward 0 as you approach it, on either leg (the mission
// field is flown through twice: once out, once back).
function aheadDistance(x, pos, leg) { return leg === 'outbound' ? (x - pos) : (pos - x); }

function drawFighterWarning(ctx, c) {
  const activeDir = activeStationDir();
  const unwatched = game.fighters.filter(f => f.dir !== activeDir);
  if (unwatched.length === 0) return;
  const nearest = unwatched.reduce((a, b) => (a.closing < b.closing ? a : b));
  const urgent = nearest.closing < 0.35;
  const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * (urgent ? 14 : 6));
  ctx.save();
  ctx.globalAlpha = 0.55 + pulse * 0.45;
  ctx.fillStyle = urgent ? '#ff3b3b' : '#ffb347';
  ctx.font = `bold ${Math.max(10, c.width * 0.036)}px sans-serif`;
  ctx.textAlign = 'center';
  const label = urgent ? `⚠ BANDIT ATTACKING FROM ${DIR_CLOCK[nearest.dir]} O'CLOCK` : `⚠ BANDIT AT ${DIR_CLOCK[nearest.dir]} O'CLOCK`;
  ctx.fillText(label, c.width / 2, c.height * 0.21);
  ctx.restore();
}

function drawBombardier(ctx, c) {
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#8fb8e0');
  grad.addColorStop(0.15, '#4a7a3c');
  grad.addColorStop(1, '#2c5222');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  const scrollOffset = (game.distance * 0.6) % 40;
  ctx.strokeStyle = '#ffffff12';
  ctx.lineWidth = 1;
  for (let y = c.height + scrollOffset; y > c.height * 0.15; y -= 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
  }

  const pos = legPositionFor(game.distance, game.leg, game.mission.distance);

  for (const t of game.targets) {
    if (t.destroyed) continue;
    const rd = aheadDistance(t.distance, pos, game.leg);
    if (rd < -60 || rd > VIEW_RANGE) continue;
    const frac = Math.max(0, Math.min(1, rd / VIEW_RANGE));
    const y = c.height * (0.92 - frac * 0.8);
    const x = screenX(c, t.lateral);
    const info = TARGET_TYPES[t.type];
    const sizeMul = t.type === 'bridge' ? 1.3 : t.type === 'flak_battery' ? 0.7 : 1;
    const size = c.width * (0.1 - frac * 0.06) * sizeMul;
    ctx.fillStyle = t.type === 'bridge' ? '#5a5a5a' : t.type === 'fuel_depot' ? '#7a3020' : t.type === 'airfield' ? '#4a4a3a' : t.type === 'flak_battery' ? '#333333' : '#7a5030';
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeStyle = '#00000060';
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    if (frac < 0.5) {
      ctx.font = `${Math.max(8, size * 0.7)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(info.icon, x, y - size * 0.55);
    }
  }

  for (const b of game.bombsInAir) {
    if (b.resolved) continue;
    const progress = Math.max(0, Math.min(1, (game.elapsed - b.releaseTime) / b.fallTime));
    const curDist = b.releaseDistance + (b.impactDistance - b.releaseDistance) * progress;
    const curLegPos = legPositionFor(curDist, game.leg, game.mission.distance);
    const rd = aheadDistance(curLegPos, pos, game.leg);
    if (rd < -60 || rd > VIEW_RANGE) continue;
    const frac = Math.max(0, Math.min(1, rd / VIEW_RANGE));
    const y = c.height * (0.92 - frac * 0.8);
    const x = screenX(c, b.lateral);
    const r = Math.max(2, c.width * 0.012 * (1 + progress));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(progress * 9); // tumbling as it falls
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.6, r * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBombsight(ctx, c);
  drawFighterWarning(ctx, c);
  drawCockpitFrame(ctx, c, 'bombardier');
}

function drawBombsight(ctx, c) {
  const jitter = game.bombsightDamaged ? (Math.random() - 0.5) * 0.05 : 0;
  const cx = screenX(c, game.aimLateral + jitter);
  const cy = c.height * 0.9;
  ctx.strokeStyle = game.bombsightDamaged ? '#ff8a6e' : '#ffe45a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 34, cy); ctx.lineTo(cx - 24, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 24, cy); ctx.lineTo(cx + 34, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 34); ctx.lineTo(cx, cy - 24); ctx.stroke();
}

// Fighter silhouette with wings, canopy, and shading — approaching head-on
// while weaving, so it grows the closer it gets and banks into its turns
// like a real aircraft rather than sitting dead-center.
function drawFighter(ctx, x, y, size, f) {
  ctx.save();
  ctx.translate(x, y);
  const bank = clamp(f.weaveVel * 0.9, -0.5, 0.5);
  ctx.rotate(bank);

  const flicker = 0.28 + Math.random() * 0.14;
  ctx.fillStyle = `rgba(255,160,80,${flicker.toFixed(2)})`;
  ctx.beginPath(); ctx.ellipse(0, size * (0.55 + Math.random() * 0.04), size * 0.1, size * 0.22, 0, 0, Math.PI * 2); ctx.fill();

  const wingGrad = ctx.createLinearGradient(-size * 0.7, 0, size * 0.7, 0);
  wingGrad.addColorStop(0, '#20242c');
  wingGrad.addColorStop(0.5, '#3c4450');
  wingGrad.addColorStop(1, '#20242c');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(-size * 0.68, size * 0.32);
  ctx.lineTo(-size * 0.12, -size * 0.05);
  ctx.lineTo(-size * 0.08, size * 0.12);
  ctx.lineTo(-size * 0.55, size * 0.42);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.68, size * 0.32);
  ctx.lineTo(size * 0.12, -size * 0.05);
  ctx.lineTo(size * 0.08, size * 0.12);
  ctx.lineTo(size * 0.55, size * 0.42);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#2c323c';
  ctx.beginPath();
  ctx.moveTo(0, size * 0.28);
  ctx.lineTo(-size * 0.1, size * 0.5);
  ctx.lineTo(size * 0.1, size * 0.5);
  ctx.closePath(); ctx.fill();

  const bodyGrad = ctx.createLinearGradient(0, -size * 0.55, 0, size * 0.4);
  bodyGrad.addColorStop(0, '#4a525e');
  bodyGrad.addColorStop(1, '#1c2026');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.58);
  ctx.quadraticCurveTo(size * 0.16, -size * 0.1, size * 0.11, size * 0.4);
  ctx.quadraticCurveTo(0, size * 0.5, -size * 0.11, size * 0.4);
  ctx.quadraticCurveTo(-size * 0.16, -size * 0.1, 0, -size * 0.58);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#00000070'; ctx.lineWidth = Math.max(1, size * 0.02); ctx.stroke();

  ctx.fillStyle = 'rgba(140,200,240,0.75)';
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.15, size * 0.06, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(-size * 0.015, -size * 0.19, size * 0.02, size * 0.05, 0, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  const barW = size * 1.15;
  ctx.fillStyle = '#00000080';
  ctx.fillRect(x - barW / 2, y - size * 0.75, barW, 4);
  ctx.fillStyle = f.hp / FIGHTER_HP > 0.5 ? '#7fd858' : f.hp / FIGHTER_HP > 0.2 ? '#e0c23a' : '#d1332e';
  ctx.fillRect(x - barW / 2, y - size * 0.75, barW * Math.max(0, f.hp / FIGHTER_HP), 4);
}

function drawGunReticle(ctx, c, st) {
  const rx = screenX(c, st.reticle);
  const ry = c.height * 0.4;
  ctx.strokeStyle = st.ammo < GUN_BURST_ROUNDS ? '#888888' : '#ffe45a';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(rx, ry, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx - 30, ry); ctx.lineTo(rx - 12, ry); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx + 12, ry); ctx.lineTo(rx + 30, ry); ctx.stroke();
}

function drawAmmoReadout(ctx, c, st) {
  const gw = c.width * 0.32, gh = 10;
  const gx = c.width / 2 - gw / 2, gy = c.height - 26;
  ctx.fillStyle = '#00000080';
  ctx.fillRect(gx, gy, gw, gh);
  const frac = st.ammo / AMMO_START;
  ctx.fillStyle = st.disabled ? '#555555' : frac > 0.3 ? '#ffb347' : '#ff5a5a';
  ctx.fillRect(gx, gy, gw * Math.max(0, frac), gh);
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, gh);
  ctx.fillStyle = '#f2f2f2';
  ctx.font = `bold ${Math.max(9, c.width * 0.03)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${st.ammo} RDS — ${Math.floor(st.ammo / GUN_BURST_ROUNDS)} BURSTS`, c.width / 2, gy - 6);
}

function drawGunner(ctx, c, dir) {
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#3a5f9e');
  grad.addColorStop(1, '#9fc3e8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  const puffOffset = (game.distance * 0.4) % 300;
  for (let i = -1; i < 3; i++) {
    const px = ((i * 300 - puffOffset) % c.width + c.width) % c.width;
    ctx.beginPath(); ctx.ellipse(px, c.height * 0.22, 46, 16, 0, 0, Math.PI * 2); ctx.fill();
  }

  const st = game.gunStations[dir];
  if (st.disabled) {
    ctx.fillStyle = 'rgba(140,0,0,0.28)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ff5a5a';
    ctx.font = `bold ${Math.max(13, c.width * 0.055)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('GUN KNOCKED OUT', c.width / 2, c.height * 0.42);
  } else {
    const sorted = game.fighters.filter(f => f.dir === dir).sort((a, b) => b.closing - a.closing);
    for (const f of sorted) {
      const closeness = 1 - f.closing;
      const size = c.width * (0.05 + closeness * 0.22);
      const x = screenX(c, f.lateral);
      const y = c.height * (0.4 - closeness * 0.05);
      drawFighter(ctx, x, y, size, f);
    }
    drawGunReticle(ctx, c, st);
    if (game.burstActive && game.burstDir === dir) drawMuzzleFlash(ctx, c, st.reticle);
  }

  drawAmmoReadout(ctx, c, st);
  drawCockpitFrame(ctx, c, 'gunner');
}

function drawPilot(ctx, c) {
  const horizonY = c.height * 0.5 - pilotTiltVisual * c.height * 0.16;
  const clampedHorizon = clamp(horizonY, 0, c.height);
  const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(1, clampedHorizon));
  skyGrad.addColorStop(0, '#3a5f9e'); skyGrad.addColorStop(1, '#9fc3e8');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, c.width, clampedHorizon);
  const groundGrad = ctx.createLinearGradient(0, clampedHorizon, 0, c.height);
  groundGrad.addColorStop(0, '#4a7a3c'); groundGrad.addColorStop(1, '#213b1a');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, clampedHorizon, c.width, c.height - clampedHorizon);
  ctx.strokeStyle = '#f2f2f2aa'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, clampedHorizon); ctx.lineTo(c.width, clampedHorizon); ctx.stroke();

  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const y = horizonY - i * c.height * 0.08;
    if (y < 0 || y > c.height) continue;
    const w = c.width * 0.12;
    ctx.beginPath(); ctx.moveTo(c.width / 2 - w, y); ctx.lineTo(c.width / 2 - w * 0.4, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.width / 2 + w * 0.4, y); ctx.lineTo(c.width / 2 + w, y); ctx.stroke();
  }

  ctx.strokeStyle = '#ffe45a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(c.width / 2 - 30, c.height / 2); ctx.lineTo(c.width / 2 - 8, c.height / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.width / 2 + 8, c.height / 2); ctx.lineTo(c.width / 2 + 30, c.height / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(c.width / 2, c.height / 2, 3, 0, Math.PI * 2); ctx.fillStyle = '#ffe45a'; ctx.fill();

  ctx.fillStyle = '#f2f2f2'; ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(12, c.width * 0.048)}px monospace`;
  ctx.fillText(`ALT ${game.altitude.toFixed(1)}`, c.width * 0.24, c.height * 0.13);
  ctx.fillText(`SPD ${Math.round(game.speed)}`, c.width * 0.76, c.height * 0.13);
  ctx.fillText(`RPM ${Math.round(game.throttle * 100)}%`, c.width * 0.24, c.height * 0.88);
  ctx.fillText(`FUEL ${Math.max(0, Math.round((game.fuel / game.fuelMax) * 100))}%`, c.width * 0.76, c.height * 0.88);

  if (game.stalling) {
    const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * 16);
    ctx.save();
    ctx.globalAlpha = 0.6 + pulse * 0.4;
    ctx.fillStyle = '#ff3b3b';
    ctx.font = `bold ${Math.max(15, c.width * 0.065)}px sans-serif`;
    ctx.fillText('⚠ STALL — DIVE TO RECOVER', c.width / 2, c.height * 0.5 + 40);
    ctx.restore();
  }

  drawFighterWarning(ctx, c);
  drawCockpitFrame(ctx, c, 'pilot');
}

// Suggests you're inside the aircraft looking out — dark wing shapes
// cutting into the bottom corners of the frame.
function drawCockpitFrame(ctx, c, mode) {
  ctx.fillStyle = '#0a0d12';
  ctx.beginPath();
  ctx.moveTo(0, c.height);
  ctx.lineTo(0, c.height * (mode === 'gunner' ? 0.78 : 0.98));
  ctx.lineTo(c.width * 0.3, c.height);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c.width, c.height);
  ctx.lineTo(c.width, c.height * (mode === 'gunner' ? 0.78 : 0.98));
  ctx.lineTo(c.width * 0.7, c.height);
  ctx.closePath(); ctx.fill();
}

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.save();
  if (game.phase !== 'flight') {
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    return;
  }
  if (shakeMag > 0) ctx.translate((Math.random() - 0.5) * shakeMag * 2, (Math.random() - 0.5) * shakeMag * 2);
  if (game.view === 'pilot') drawPilot(ctx, c);
  else if (game.view === 'bombardier') drawBombardier(ctx, c);
  else drawGunner(ctx, c, game.view.slice(4));
  drawParticles(ctx);
  drawDamageVignette(ctx, c);
  drawFlash(ctx, c);
  ctx.restore();
}

/* ------------------------------------------- HUD ------------------------------------------- */

function updateHud() {
  $('#score').textContent = game.campaignScore;
  $('#missionScore').textContent = game.phase === 'flight' ? game.missionScore : '—';
  $('#best').textContent = game.best;
  $('#hp').textContent = game.phase === 'flight' ? Math.round(game.hp) : '—';
  $('#fuel').textContent = game.phase === 'flight' ? `${Math.max(0, Math.round((game.fuel / game.fuelMax) * 100))}%` : '—';
  $('#bombs').textContent = game.phase === 'flight' ? game.bombsLeft : '—';
  $('#viewLabel').textContent = STATION_LABEL[game.view] || '';
  $('#viewLabel').style.display = game.phase === 'flight' ? '' : 'none';
  const stationsIcons = $('#stations-icons');
  if (game.phase === 'flight') {
    stationsIcons.textContent = DIRS.map(d => {
      const st = game.gunStations[d];
      return st.disabled ? '\u{1F534}' : st.ammo < GUN_BURST_ROUNDS ? '⚪' : '\u{1F7E2}';
    }).join('');
  } else {
    stationsIcons.textContent = '';
  }
  document.querySelectorAll('.station-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === game.view));
  const legLabel = $('#legLabel');
  if (game.phase === 'flight' && game.leg === 'return') {
    legLabel.textContent = 'RETURNING TO BASE';
    legLabel.classList.add('show');
  } else {
    legLabel.classList.remove('show');
  }
  $('#station-strip').style.display = game.phase === 'flight' ? '' : 'none';
}

/* ---------------------------------------- game loop ---------------------------------------- */

function processEvents(events, c) {
  for (const e of events) {
    const pan = e.dir !== undefined ? DIR_PAN[e.dir] : null;
    if (e.type === 'flak') {
      SFX.flak();
      for (let i = 0; i < 2; i++) {
        spawnBurst(rand(c.width * 0.2, c.width * 0.8), rand(c.height * 0.1, c.height * 0.5),
          { count: 14, colors: ['#444', '#666', '#888', '#ddd'], speed: [15, 60], size: [3, 7], life: [0.5, 1.0], gravity: -15 });
      }
      triggerShake(6, 0.25);
      triggerFlash(0.22);
    } else if (e.type === 'bombsightDamaged') {
      SFX.bombsightDamage();
    } else if (e.type === 'friendlyFire') {
      SFX.friendlyFire();
      triggerFlash(0.3);
    } else if (e.type === 'targetHit') {
      SFX.hitTarget();
    } else if (e.type === 'fighterSpawn') {
      SFX.fighterSpawn(pan);
    } else if (e.type === 'fighterAttack') {
      SFX.planeHit(pan);
      triggerFlash(0.35);
      triggerShake(8, 0.3);
    } else if (e.type === 'stationDisabled') {
      SFX.stationDown(pan);
      triggerShake(3, 0.15);
    } else if (e.type === 'fighterKilled') {
      SFX.fighterKill();
    }
  }
}

let wasStalling = false;
let prevPhase = null;

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  resizeCanvas();

  if (game.phase === 'flight') {
    const c = canvas();
    const pos = legPositionFor(game.distance, game.leg, game.mission.distance);
    const prevFighterScreenState = captureFighterScreenState(c);
    const destroyedBefore = game.targets.filter(t => t.destroyed).length;

    update(game, dt);

    processEvents(game.events, c);
    checkTargetExplosions(c, legPositionFor(game.distance, game.leg, game.mission.distance));

    if (game.events.some(e => e.type === 'fighterKilled')) {
      const afterIds = new Set(game.fighters.map(f => f.id));
      for (const v of prevFighterScreenState) {
        if (!afterIds.has(v.id)) {
          spawnBurst(v.x, v.y, { count: 22, colors: ['#ffe08a', '#ff8a3c', '#ff4a2c', '#555'], speed: [50, 200], size: [2, 6], life: [0.3, 0.6] });
          triggerShake(3, 0.15);
        }
      }
    }

    if (!wasStalling && game.stalling) SFX.stall();
    wasStalling = game.stalling;

    updateHud();

    if (game.phase === 'base' && game.pendingSummary) {
      SFX.missionComplete();
      showMissionSummary();
    } else if (game.phase === 'campaignOver') {
      if (game.endReason === 'shotdown') { SFX.shotDown(); triggerFlash(0.5); triggerShake(10, 0.5); }
      else if (game.endReason === 'crashed') { SFX.crashed(); spawnBurst(c.width / 2, c.height / 2, { count: 40, colors: ['#ffcf6e', '#ff8a3c', '#c23b1e', '#3a3a3a'], speed: [40, 260], size: [3, 9], life: [0.6, 1.3], gravity: 30 }); triggerShake(14, 0.6); }
      else if (game.endReason === 'ditched') { SFX.ditched(); triggerShake(8, 0.4); }
      showCampaignOverOverlay();
    }
  } else if (prevPhase === 'flight') {
    updateHud();
  }
  prevPhase = game.phase;

  updateEffects(dt);
  draw();
  requestAnimationFrame(loop);
}

/* --------------------------------------- overlays --------------------------------------- */

function skillLabel(level) { return SKILL_LEVELS[level - 1].name; }

function showBase() {
  $('#overlay').classList.remove('show');
  const el = $('#briefing');
  el.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'briefing-title';
  title.textContent = `Home Base — Mission #${game.missionsFlown + 1}`;
  el.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'briefing-sub';
  sub.textContent = `Campaign Score ${game.campaignScore} — Best ${game.best}`;
  el.appendChild(sub);

  const skillRow = document.createElement('div');
  skillRow.className = 'skill-row';
  SKILL_LEVELS.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'skill-btn' + (s.level === game.skillLevel ? ' active' : '');
    btn.textContent = `${s.level}`;
    btn.title = s.name;
    bindTap(btn, () => { SFX.click(); setSkillLevel(game, s.level); showBase(); });
    skillRow.appendChild(btn);
  });
  const skillNameLabel = document.createElement('div');
  skillNameLabel.className = 'skill-name';
  skillNameLabel.textContent = skillLabel(game.skillLevel);
  el.appendChild(skillRow);
  el.appendChild(skillNameLabel);

  const bombRow = document.createElement('div');
  bombRow.className = 'bombload-row';
  const minus = document.createElement('button');
  minus.className = 'stepper-btn';
  minus.textContent = '−';
  bindTap(minus, () => { SFX.click(); setBombLoad(game, game.bombLoad - 1); showBase(); });
  const val = document.createElement('span');
  val.className = 'bombload-value';
  val.textContent = `${game.bombLoad} BOMBS`;
  const plus = document.createElement('button');
  plus.className = 'stepper-btn';
  plus.textContent = '+';
  bindTap(plus, () => { SFX.click(); setBombLoad(game, game.bombLoad + 1); showBase(); });
  bombRow.appendChild(minus); bombRow.appendChild(val); bombRow.appendChild(plus);
  el.appendChild(bombRow);

  const mapWrap = document.createElement('div');
  mapWrap.className = 'radial-map';
  const baseIcon = document.createElement('div');
  baseIcon.className = 'map-base-icon';
  baseIcon.textContent = '\u{1F3E0}';
  mapWrap.appendChild(baseIcon);

  let selectedSiteId = null;
  const info = document.createElement('div');
  info.className = 'map-preview';
  info.textContent = 'Tap a site to preview its targets.';

  const takeoffBtn = document.createElement('button');
  takeoffBtn.className = 'takeoff-btn';
  takeoffBtn.textContent = 'TAKE OFF';
  takeoffBtn.disabled = true;
  bindTap(takeoffBtn, () => {
    if (!selectedSiteId) return;
    SFX.click();
    startMission(game, selectedSiteId);
    particles = []; shakeTime = 0; shakeMag = 0; flashAlpha = 0;
    explodedTargetIds.clear();
    wasStalling = false;
    el.classList.remove('show');
    updateHud();
  });

  game.sites.forEach(site => {
    const norm = (site.distance - SITE_MIN_DIST) / (SITE_MAX_DIST - SITE_MIN_DIST);
    const r = 22 + norm * 26;
    const x = 50 + Math.cos(site.angle) * r;
    const y = 50 + Math.sin(site.angle) * r;
    const marker = document.createElement('button');
    marker.className = 'map-site';
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.textContent = '✈️';
    bindTap(marker, () => {
      SFX.click();
      selectedSiteId = site.id;
      document.querySelectorAll('.map-site').forEach(m => m.classList.remove('selected'));
      marker.classList.add('selected');
      const counts = {};
      site.targetTypes.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      const desc = Object.entries(counts).map(([type, n]) => `${n}× ${TARGET_TYPES[type].icon} ${TARGET_TYPES[type].name}`).join(', ');
      info.textContent = `${site.name} — ${Math.round(site.distance)} mi: ${desc}`;
      takeoffBtn.disabled = false;
    });
    mapWrap.appendChild(marker);
  });
  el.appendChild(mapWrap);
  el.appendChild(info);
  el.appendChild(takeoffBtn);

  const retireBtn = document.createElement('button');
  retireBtn.className = 'retire-btn';
  retireBtn.textContent = 'End Campaign';
  bindTap(retireBtn, () => {
    SFX.click();
    endCampaign(game);
    showCampaignOverOverlay();
  });
  el.appendChild(retireBtn);

  el.classList.add('show');
}

function showMissionSummary() {
  const summary = game.pendingSummary;
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  overlay.classList.add('show');
  const msg = document.createElement('div');
  msg.className = 'overlay-msg';
  msg.textContent = `Mission Complete — ${summary.siteName}`;
  overlay.appendChild(msg);
  const sub = document.createElement('div');
  sub.className = 'overlay-sub';
  sub.textContent = `+${summary.missionScore} this mission (incl. ${summary.bonus} safe-return bonus) — Campaign ${game.campaignScore}`;
  overlay.appendChild(sub);
  const detail = document.createElement('div');
  detail.className = 'overlay-objective';
  detail.textContent = `Landed with ${Math.round(summary.hp)} HP, ${summary.bombsUsed} bombs used.`;
  overlay.appendChild(detail);
  const btn = document.createElement('button');
  btn.textContent = 'Back to Base';
  btn.addEventListener('click', () => {
    ackSummary(game);
    overlay.classList.remove('show');
    updateHud();
    showBase();
  });
  overlay.appendChild(btn);
}

function showCampaignOverOverlay() {
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  overlay.classList.add('show');
  const reasonText = {
    shotdown: 'Shot Down',
    ditched: 'Ditched — Out of Fuel',
    crashed: 'Crashed',
    retired: 'Campaign Retired',
  }[game.endReason] || 'Campaign Over';
  const msg = document.createElement('div');
  msg.className = 'overlay-msg';
  msg.textContent = reasonText;
  overlay.appendChild(msg);
  const sub = document.createElement('div');
  sub.className = 'overlay-sub';
  sub.textContent = `Campaign Score ${game.campaignScore} — Best ${game.best} — ${game.missionsFlown} mission${game.missionsFlown === 1 ? '' : 's'} flown`;
  overlay.appendChild(sub);
  const btn = document.createElement('button');
  btn.textContent = 'New Campaign';
  btn.addEventListener('click', restart);
  overlay.appendChild(btn);
}

function restart() {
  game = newGame();
  particles = [];
  shakeTime = 0; shakeMag = 0; flashAlpha = 0;
  explodedTargetIds.clear();
  wasStalling = false;
  prevPhase = null;
  $('#overlay').classList.remove('show');
  updateHud();
  showBase();
}

/* --------------------------------------- input --------------------------------------- */

function bindHold(el, key) {
  let active = false;
  const start = e => { if (e) e.preventDefault(); if (active) return; active = true; el.classList.add('held'); setInput(game, { [key]: true }); };
  const end = () => { if (!active) return; active = false; el.classList.remove('held'); setInput(game, { [key]: false }); };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

function bindTap(el, action) {
  let handledByPointer = false;
  el.addEventListener('pointerdown', e => { e.preventDefault(); handledByPointer = true; action(); });
  el.addEventListener('click', () => {
    if (handledByPointer) { handledByPointer = false; return; }
    action();
  });
}

const KEY_MAP = {
  ArrowUp: 'altUp', w: 'altUp', W: 'altUp',
  ArrowDown: 'altDown', s: 'altDown', S: 'altDown',
  ArrowLeft: 'aimLeft', a: 'aimLeft', A: 'aimLeft',
  ArrowRight: 'aimRight', d: 'aimRight', D: 'aimRight',
};

const STATION_KEYS = { '1': 'pilot', '2': 'bombardier', '3': 'gun-N', '4': 'gun-E', '5': 'gun-S', '6': 'gun-W' };

function cycleStation() {
  const i = STATION_ORDER.indexOf(game.view);
  switchView(game, STATION_ORDER[(i + 1) % STATION_ORDER.length]);
  updateHud();
}

// A tap/click (press+release with little movement, no held button) fires or
// drops a bomb right where you're aimed; a drag only repositions aim so
// adjusting your reticle never accidentally triggers a shot.
function performTapAction() {
  if (game.phase !== 'flight') return;
  if (game.view === 'bombardier') {
    if (dropBomb(game)) SFX.dropBomb();
  } else if (game.view.startsWith('gun-')) {
    const dir = game.view.slice(4);
    if (fireBurst(game)) SFX.gunBurst(DIR_PAN[dir]);
    else SFX.ammoEmpty();
  }
}

// Mouse tracks aim continuously on hover; touch requires a drag (no hover
// on touch), both via the unified Pointer Events API.
let pointerDown = false;
let dragStartX = 0, dragStartY = 0, dragStartTime = 0, didDrag = false;
const TAP_MOVE_THRESHOLD = 10, TAP_TIME_THRESHOLD = 400;
function aimFromEvent(e) {
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width; // 0..1
  const lateral = (frac - 0.5) / 0.42;
  setAim(game, lateral);
}
function onCanvasPointerMove(e) {
  if (e.pointerType === 'mouse' || pointerDown) {
    aimFromEvent(e);
    if (pointerDown && Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > TAP_MOVE_THRESHOLD) didDrag = true;
  }
}
function onCanvasPointerDown(e) {
  e.preventDefault();
  pointerDown = true;
  didDrag = false;
  dragStartX = e.clientX; dragStartY = e.clientY; dragStartTime = performance.now();
  aimFromEvent(e);
  const c = canvas();
  if (c.setPointerCapture) { try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
}
function onCanvasPointerUp() {
  pointerDown = false;
  if (!didDrag && performance.now() - dragStartTime < TAP_TIME_THRESHOLD) performTapAction();
}

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  setSoundOn(soundOn);

  const c = canvas();
  c.addEventListener('pointerdown', onCanvasPointerDown);
  c.addEventListener('pointermove', onCanvasPointerMove);
  c.addEventListener('pointerup', onCanvasPointerUp);
  c.addEventListener('pointercancel', onCanvasPointerUp);
  c.addEventListener('contextmenu', e => e.preventDefault());

  const keyHeld = {};
  document.addEventListener('keydown', e => {
    if (e.key === ' ') { e.preventDefault(); performTapAction(); return; }
    if (e.key === 'Tab') { e.preventDefault(); cycleStation(); return; }
    if (STATION_KEYS[e.key]) { e.preventDefault(); switchView(game, STATION_KEYS[e.key]); updateHud(); return; }
    if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); setInput(game, { throttleDown: true }); return; }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setInput(game, { throttleUp: true }); return; }
    const key = KEY_MAP[e.key];
    if (!key) return;
    e.preventDefault();
    if (!keyHeld[e.key]) { keyHeld[e.key] = true; setInput(game, { [key]: true }); }
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'q' || e.key === 'Q') { setInput(game, { throttleDown: false }); return; }
    if (e.key === 'e' || e.key === 'E') { setInput(game, { throttleUp: false }); return; }
    const key = KEY_MAP[e.key];
    if (!key) return;
    keyHeld[e.key] = false;
    setInput(game, { [key]: false });
  });

  bindHold($('#btn-alt-up'), 'altUp');
  bindHold($('#btn-alt-down'), 'altDown');
  bindHold($('#btn-aim-left'), 'aimLeft');
  bindHold($('#btn-aim-right'), 'aimRight');
  bindHold($('#btn-throttle-up'), 'throttleUp');
  bindHold($('#btn-throttle-down'), 'throttleDown');

  document.querySelectorAll('.station-btn').forEach(btn => {
    bindTap(btn, () => { switchView(game, btn.dataset.view); updateHud(); });
  });

  bindTap($('#new-game-btn'), () => {
    if (game.phase === 'base' || confirm('Abandon this mission and start a new campaign?')) restart();
  });
  bindTap($('#sound-btn'), () => setSoundOn(!soundOn));

  updateHud();
  showBase();
  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
