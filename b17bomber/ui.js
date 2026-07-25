'use strict';

let game = newGame();
let lastTime = null;
const VIEW_RANGE = 600;

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
function beep({ freq = 440, dur = 0.15, type = 'sine', vol = 0.2, sweep = null, delay = 0 }) {
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
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function noiseBurst({ dur = 0.2, vol = 0.3, delay = 0 }) {
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
  src.connect(gain); gain.connect(ctx.destination);
  src.start(ctx.currentTime + delay);
}
const SFX = {
  click: () => beep({ freq: 700, dur: 0.05, vol: 0.12 }),
  dropBomb: () => beep({ freq: 500, sweep: 160, dur: 0.5, type: 'sine', vol: 0.14 }),
  hitTarget: () => { noiseBurst({ dur: 0.35, vol: 0.32 }); beep({ freq: 160, sweep: 50, dur: 0.3, type: 'triangle', vol: 0.16, delay: 0.02 }); },
  gunFire: () => noiseBurst({ dur: 0.055, vol: 0.16 }),
  fighterKill: () => { noiseBurst({ dur: 0.3, vol: 0.28 }); beep({ freq: 240, sweep: 70, dur: 0.3, type: 'sawtooth', vol: 0.12, delay: 0.02 }); },
  planeHit: () => beep({ freq: 180, sweep: 90, dur: 0.3, type: 'square', vol: 0.22 }),
  flak: () => beep({ freq: 130, sweep: 55, dur: 0.22, type: 'square', vol: 0.2 }),
  overheat: () => beep({ freq: 900, sweep: 300, dur: 0.2, type: 'square', vol: 0.14 }),
  engineHit: () => { beep({ freq: 110, sweep: 40, dur: 0.4, type: 'sawtooth', vol: 0.2 }); noiseBurst({ dur: 0.25, vol: 0.14, delay: 0.05 }); },
  missionWin: () => { beep({ freq: 440, dur: 0.15, vol: 0.2 }); beep({ freq: 660, dur: 0.2, vol: 0.2, delay: 0.15 }); beep({ freq: 880, dur: 0.32, vol: 0.22, delay: 0.32 }); },
  shotDown: () => beep({ freq: 260, sweep: 50, dur: 1.1, type: 'sawtooth', vol: 0.18 }),
  crashed: () => { beep({ freq: 200, sweep: 30, dur: 1.4, type: 'sawtooth', vol: 0.2 }); noiseBurst({ dur: 0.6, vol: 0.3, delay: 0.9 }); },
  fighterSpawn: () => { beep({ freq: 520, sweep: 720, dur: 0.16, type: 'triangle', vol: 0.15 }); beep({ freq: 520, sweep: 720, dur: 0.16, type: 'triangle', vol: 0.15, delay: 0.2 }); },
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

function drawMuzzleFlash(ctx, c) {
  if (!game.input.fire) return;
  const rx = screenX(c, game.gunReticle);
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

// Ground explosion the moment a target is destroyed — scans once per frame,
// each target fires its burst exactly once via explodedTargetIds.
function checkTargetExplosions(c) {
  for (const t of game.targets) {
    if (!t.destroyed || explodedTargetIds.has(t.id)) continue;
    explodedTargetIds.add(t.id);
    if (game.view !== 'bombardier') continue;
    const rd = t.distance - game.distance;
    if (rd < -200 || rd > VIEW_RANGE + 100) continue;
    const frac = Math.max(0, Math.min(1, rd / VIEW_RANGE));
    const y = c.height * (0.92 - frac * 0.8);
    const x = screenX(c, t.lateral);
    spawnBurst(x, y, { count: 26, colors: ['#ffcf6e', '#ff8a3c', '#c23b1e', '#3a3a3a'], speed: [40, 180], size: [3, 7], life: [0.4, 0.9], gravity: 40 });
    triggerShake(4, 0.2);
  }
}

function captureFighterScreenState(c) {
  return game.fighters.map(f => {
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

  for (const t of game.targets) {
    if (t.destroyed) continue;
    const rd = t.distance - game.distance;
    if (rd < -60 || rd > VIEW_RANGE) continue;
    const frac = Math.max(0, Math.min(1, rd / VIEW_RANGE));
    const y = c.height * (0.92 - frac * 0.8);
    const x = screenX(c, t.lateral);
    const info = TARGET_TYPES[t.type];
    const size = c.width * (0.1 - frac * 0.06) * (t.type === 'bridge' ? 1.3 : 1);
    const isPrimary = t.type === game.primaryType;
    if (isPrimary) {
      ctx.strokeStyle = '#ffe45a';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.strokeRect(x - size * 0.62, y - size * 0.62, size * 1.24, size * 1.24);
    }
    ctx.fillStyle = t.type === 'bridge' ? '#5a5a5a' : t.type === 'fuel_depot' ? '#7a3020' : t.type === 'airfield' ? '#4a4a3a' : '#7a5030';
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
    const rd = curDist - game.distance;
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

// Fighters are only rendered in the gunner view, so without this the
// bombardier has zero warning before a fighter reaches attack range —
// damage would land with no visible cause. Pulses faster/redder as the
// nearest fighter closes in.
function drawFighterWarning(ctx, c) {
  if (game.view !== 'bombardier' || game.fighters.length === 0) return;
  const nearest = Math.min(...game.fighters.map(f => f.closing));
  const urgent = nearest < 0.35;
  const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * (urgent ? 14 : 6));
  ctx.save();
  ctx.globalAlpha = 0.55 + pulse * 0.45;
  ctx.fillStyle = urgent ? '#ff3b3b' : '#ffb347';
  ctx.font = `bold ${Math.max(11, c.width * 0.04)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(urgent ? '⚠ FIGHTER ATTACKING' : '⚠ FIGHTER INBOUND — SWITCH VIEW', c.width / 2, c.height * 0.12);
  ctx.restore();
}

function drawBombsight(ctx, c) {
  const cx = screenX(c, game.aimLateral);
  const cy = c.height * 0.9;
  ctx.strokeStyle = '#ffe45a';
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

  // engine glow trail, flickering
  const flicker = 0.28 + Math.random() * 0.14;
  ctx.fillStyle = `rgba(255,160,80,${flicker.toFixed(2)})`;
  ctx.beginPath(); ctx.ellipse(0, size * (0.55 + Math.random() * 0.04), size * 0.1, size * 0.22, 0, 0, Math.PI * 2); ctx.fill();

  // wings (swept trapezoid)
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

  // tail fin
  ctx.fillStyle = '#2c323c';
  ctx.beginPath();
  ctx.moveTo(0, size * 0.28);
  ctx.lineTo(-size * 0.1, size * 0.5);
  ctx.lineTo(size * 0.1, size * 0.5);
  ctx.closePath(); ctx.fill();

  // fuselage
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

  // canopy glass
  ctx.fillStyle = 'rgba(140,200,240,0.75)';
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.15, size * 0.06, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(-size * 0.015, -size * 0.19, size * 0.02, size * 0.05, 0, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  // health bar
  const barW = size * 1.15;
  ctx.fillStyle = '#00000080';
  ctx.fillRect(x - barW / 2, y - size * 0.75, barW, 4);
  ctx.fillStyle = f.hp / FIGHTER_HP > 0.5 ? '#7fd858' : f.hp / FIGHTER_HP > 0.2 ? '#e0c23a' : '#d1332e';
  ctx.fillRect(x - barW / 2, y - size * 0.75, barW * Math.max(0, f.hp / FIGHTER_HP), 4);
}

function drawGunner(ctx, c) {
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#3a5f9e');
  grad.addColorStop(1, '#9fc3e8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  // distant cloud puffs for depth
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  const puffOffset = (game.distance * 0.4) % 300;
  for (let i = -1; i < 3; i++) {
    const px = ((i * 300 - puffOffset) % c.width + c.width) % c.width;
    ctx.beginPath(); ctx.ellipse(px, c.height * 0.22, 46, 16, 0, 0, Math.PI * 2); ctx.fill();
  }

  const sorted = game.fighters.slice().sort((a, b) => b.closing - a.closing); // draw distant first
  for (const f of sorted) {
    const closeness = 1 - f.closing;
    const size = c.width * (0.05 + closeness * 0.22);
    const x = screenX(c, f.lateral);
    const y = c.height * (0.4 - closeness * 0.05);
    drawFighter(ctx, x, y, size, f);
  }

  drawGunReticle(ctx, c);
  drawMuzzleFlash(ctx, c);
  drawCockpitFrame(ctx, c, 'gunner');
}

function drawGunReticle(ctx, c) {
  const rx = screenX(c, game.gunReticle);
  const ry = c.height * 0.4;
  ctx.strokeStyle = game.gunLocked ? '#ff5a5a' : '#ffe45a';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(rx, ry, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx - 30, ry); ctx.lineTo(rx - 12, ry); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx + 12, ry); ctx.lineTo(rx + 30, ry); ctx.stroke();

  const gw = c.width * 0.3, gh = 10;
  const gx = c.width / 2 - gw / 2, gy = c.height - 26;
  ctx.fillStyle = '#00000080';
  ctx.fillRect(gx, gy, gw, gh);
  ctx.fillStyle = game.gunLocked ? '#ff5a5a' : '#ffb347';
  ctx.fillRect(gx, gy, gw * game.gunHeat, gh);
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, gh);
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

// Cockpit instrument gauges — altitude (with the flak-safe line marked, so
// the danger zone is something you can see and choose to avoid, not a
// hidden dice roll) and throttle. Drawn in both views since they apply
// regardless of which one you're looking at.
function drawVerticalGauge(ctx, x, y, w, h, frac, color, label, warnLine) {
  frac = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  const fillH = h * frac;
  ctx.fillStyle = color;
  ctx.fillRect(x, y + h - fillH, w, fillH);
  if (warnLine !== null) {
    const wy = y + h - h * warnLine;
    ctx.strokeStyle = 'rgba(255,70,60,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 3, wy); ctx.lineTo(x + w + 3, wy); ctx.stroke();
  }
  ctx.fillStyle = '#f2f2f2';
  ctx.font = `bold ${Math.max(8, w * 0.55)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y - 6);
}

function drawInstruments(ctx, c) {
  const gw = c.width * 0.045, gh = c.height * 0.15;
  const y = c.height - gh - 14;
  drawVerticalGauge(ctx, c.width * 0.05, y, gw, gh, (game.altitude - MIN_ALT) / (MAX_ALT - MIN_ALT), '#8fc7ff', 'ALT', (FLAK_SAFE_ALT - MIN_ALT) / (MAX_ALT - MIN_ALT));
  drawVerticalGauge(ctx, c.width * 0.95 - gw, y, gw, gh, game.throttle, '#ffb347', 'THR', null);
}

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.save();
  if (shakeMag > 0) ctx.translate((Math.random() - 0.5) * shakeMag * 2, (Math.random() - 0.5) * shakeMag * 2);
  if (game.view === 'bombardier') drawBombardier(ctx, c);
  else drawGunner(ctx, c);
  drawInstruments(ctx, c);
  drawParticles(ctx);
  drawDamageVignette(ctx, c);
  drawFlash(ctx, c);
  ctx.restore();
}

/* ------------------------------------------- HUD ------------------------------------------- */

const ENGINE_ICON = { ok: '🟢', smoking: '🟡', dead: '🔴' };

function updateHud() {
  $('#score').textContent = game.score;
  $('#best').textContent = game.best;
  $('#hp').textContent = Math.round(game.hp);
  $('#bombs').textContent = game.bombsLeft;
  $('#viewLabel').textContent = game.view === 'bombardier' ? 'BOMBARDIER' : 'GUNNER';
  const objInfo = game.primaryType ? TARGET_TYPES[game.primaryType] : null;
  $('#objective').textContent = objInfo ? `${objInfo.icon} ${objInfo.name}` : '—';
  $('#engines-icons').textContent = game.engines.map(s => ENGINE_ICON[s]).join('');
  const legLabel = $('#legLabel');
  if (game.briefingDone && !game.over && game.leg === 'return') {
    legLabel.textContent = 'RETURNING TO BASE';
    legLabel.classList.add('show');
  } else {
    legLabel.classList.remove('show');
  }
}

/* ---------------------------------------- game loop ---------------------------------------- */

let prev = null;
function snapshot() {
  return {
    bombsInAir: game.bombsInAir.length,
    destroyedCount: game.targets.filter(t => t.destroyed).length,
    fighterCount: game.fighters.length,
    score: game.score,
    hp: game.hp,
    lastFlakHit: game.lastFlakHit,
    lastEngineHit: game.lastEngineHit,
    gunLocked: game.gunLocked,
    over: game.over,
  };
}

function playTransitionFeedback(before, after, prevFighterScreenState) {
  const c = canvas();
  const fighterKilledThisFrame = after.score > before.score && after.destroyedCount === before.destroyedCount && after.fighterCount <= before.fighterCount;

  if (after.fighterCount > before.fighterCount) SFX.fighterSpawn();
  if (after.destroyedCount > before.destroyedCount) SFX.hitTarget();
  checkTargetExplosions(c);

  if (after.lastFlakHit !== before.lastFlakHit) {
    SFX.flak();
    for (let i = 0; i < 2; i++) {
      spawnBurst(rand(c.width * 0.2, c.width * 0.8), rand(c.height * 0.1, c.height * 0.5),
        { count: 14, colors: ['#444', '#666', '#888', '#ddd'], speed: [15, 60], size: [3, 7], life: [0.5, 1.0], gravity: -15 });
    }
    triggerShake(6, 0.25);
    triggerFlash(0.22);
  }

  if (after.lastEngineHit !== before.lastEngineHit) {
    SFX.engineHit();
    spawnBurst(c.width * 0.15, c.height * 0.9, { count: 10, colors: ['#888', '#666', '#333'], speed: [20, 70], size: [2, 4], life: [0.3, 0.6], gravity: -20 });
    triggerShake(3, 0.15);
  }

  if (fighterKilledThisFrame) SFX.fighterKill();

  const afterIds = new Set(game.fighters.map(f => f.id));
  for (const v of prevFighterScreenState) {
    if (afterIds.has(v.id)) continue;
    if (fighterKilledThisFrame) {
      spawnBurst(v.x, v.y, { count: 22, colors: ['#ffe08a', '#ff8a3c', '#ff4a2c', '#555'], speed: [50, 200], size: [2, 6], life: [0.3, 0.6] });
      triggerShake(3, 0.15);
    } else {
      SFX.planeHit();
      triggerFlash(0.35);
      triggerShake(8, 0.3);
    }
  }

  if (!before.gunLocked && after.gunLocked) SFX.overheat();

  if (!before.over && after.over) {
    if (game.win) {
      SFX.missionWin();
    } else if (game.crashed) {
      SFX.crashed();
      spawnBurst(c.width / 2, c.height / 2, { count: 40, colors: ['#ffcf6e', '#ff8a3c', '#c23b1e', '#3a3a3a'], speed: [40, 260], size: [3, 9], life: [0.6, 1.3], gravity: 30 });
      triggerShake(14, 0.6);
    } else {
      SFX.shotDown();
      triggerFlash(0.5);
      triggerShake(10, 0.5);
    }
  }
}

let gunFireTimer = 0;

function loop(now) {
  if (lastTime === null) lastTime = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  resizeCanvas();

  if (game.briefingDone && !game.over) {
    if (prev === null) prev = snapshot();
    const prevFighterScreenState = captureFighterScreenState(canvas());
    update(game, dt);
    if (game.view === 'gunner' && game.input.fire && !game.gunLocked) {
      gunFireTimer -= dt;
      if (gunFireTimer <= 0) { SFX.gunFire(); gunFireTimer = 0.09; }
    } else {
      gunFireTimer = 0;
    }
    const after = snapshot();
    playTransitionFeedback(prev, after, prevFighterScreenState);
    prev = after;
    updateHud();
    if (game.over) showEndOverlay();
  }
  updateEffects(dt);
  draw();
  requestAnimationFrame(loop);
}

/* --------------------------------------- overlays --------------------------------------- */

function showBriefing() {
  const el = $('#briefing');
  el.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'briefing-title';
  title.textContent = 'Mission Briefing';
  el.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'briefing-sub';
  sub.textContent = 'Tap a target on the map to make it your primary objective — hitting it scores double, and destroying it awards a completion bonus.';
  el.appendChild(sub);

  const mapWrap = document.createElement('div');
  mapWrap.className = 'target-map';
  const base = document.createElement('div');
  base.className = 'map-endpoint map-base';
  base.textContent = 'BASE';
  mapWrap.appendChild(base);
  const zone = document.createElement('div');
  zone.className = 'map-endpoint map-zone';
  zone.textContent = 'TARGET ZONE';
  mapWrap.appendChild(zone);

  let armedId = null;
  const sorted = game.targets.slice().sort((a, b) => a.distance - b.distance);
  for (const t of sorted) {
    const typeInfo = TARGET_TYPES[t.type];
    const marker = document.createElement('button');
    marker.className = 'map-marker';
    marker.style.left = `${(t.distance / TRACK_LENGTH) * 100}%`;
    marker.style.top = `${50 + t.lateral * 38}%`;
    marker.textContent = typeInfo.icon;
    bindTap(marker, () => {
      if (armedId === t.id) {
        SFX.click();
        chooseTarget(game, t.id);
        el.classList.remove('show');
        updateHud();
        return;
      }
      SFX.click();
      armedId = t.id;
      document.querySelectorAll('.map-marker').forEach(m => m.classList.remove('armed'));
      marker.classList.add('armed');
      info.textContent = `${typeInfo.icon} ${typeInfo.name} — ${typeInfo.desc} ${typeInfo.value} pts (x2 as primary). Tap again to confirm.`;
    });
    mapWrap.appendChild(marker);
  }
  el.appendChild(mapWrap);

  const info = document.createElement('div');
  info.className = 'map-info';
  info.textContent = 'Tap a marker to see details, tap again to confirm.';
  el.appendChild(info);

  el.classList.add('show');
}

function showEndOverlay() {
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  overlay.classList.add('show');
  const msg = document.createElement('div');
  msg.className = 'overlay-msg';
  msg.textContent = game.win ? 'Mission Complete' : game.crashed ? 'Engines Out — Went Down' : 'Shot Down';
  overlay.appendChild(msg);
  const sub = document.createElement('div');
  sub.className = 'overlay-sub';
  sub.textContent = `Score ${game.score} — Best ${game.best}`;
  overlay.appendChild(sub);
  if (game.win) {
    const objInfo = TARGET_TYPES[game.primaryType];
    const objLine = document.createElement('div');
    objLine.className = 'overlay-objective';
    objLine.textContent = game.primaryObjectiveComplete
      ? `Primary objective (${objInfo.icon} ${objInfo.name}) cleared — +${PRIMARY_COMPLETE_BONUS}`
      : `Primary objective (${objInfo.icon} ${objInfo.name}) not fully cleared`;
    overlay.appendChild(objLine);
  }
  const btn = document.createElement('button');
  btn.textContent = 'Fly Again';
  btn.addEventListener('click', restart);
  overlay.appendChild(btn);
}

function restart() {
  game = newGame();
  prev = null;
  particles = [];
  shakeTime = 0; shakeMag = 0; flashAlpha = 0;
  explodedTargetIds.clear();
  $('#overlay').classList.remove('show');
  updateHud();
  showBriefing();
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

// A tap/click (press+release with little movement, no held button) fires
// or drops a bomb right where you're aimed; a drag only repositions aim
// so adjusting your reticle never accidentally triggers a shot.
let burstTimer = null;
function performTapAction() {
  if (!game.briefingDone || game.over) return;
  if (game.view === 'bombardier') { if (dropBomb(game)) SFX.dropBomb(); }
  else {
    setInput(game, { fire: true });
    if (burstTimer) clearTimeout(burstTimer);
    burstTimer = setTimeout(() => setInput(game, { fire: false }), 90);
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
  updateHud();
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
    if (e.key === 'v' || e.key === 'V' || e.key === 'Tab') { e.preventDefault(); toggleView(game); updateHud(); return; }
    if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); setInput(game, { throttleDown: true }); return; }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setInput(game, { throttleUp: true }); return; }
    const key = KEY_MAP[e.key];
    if (!key) return;
    e.preventDefault();
    if (!keyHeld[e.key]) { keyHeld[e.key] = true; setInput(game, { [key]: true }); }
  });
  document.addEventListener('keyup', e => {
    if (e.key === ' ') { setInput(game, { fire: false }); return; }
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

  bindTap($('#btn-view'), () => { toggleView(game); updateHud(); });
  bindTap($('#new-game-btn'), restart);
  bindTap($('#sound-btn'), () => setSoundOn(!soundOn));

  showBriefing();
  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
