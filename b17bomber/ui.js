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
};

function setSoundOn(on) {
  soundOn = on;
  try { localStorage.setItem('b17bomber-muted', on ? '0' : '1'); } catch (e) { /* ignore */ }
  $('#sound-btn').classList.toggle('muted', !on);
  $('#sound-btn').textContent = on ? '\u{1F50A}' : '\u{1F507}';
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
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(x, y, Math.max(2, c.width * 0.012 * (1 + progress)), 0, Math.PI * 2); ctx.fill();
  }

  drawBombsight(ctx, c);
  drawCockpitFrame(ctx, c, 'bombardier');
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

// Fighter silhouette with wings, canopy, and shading — approaching head-on,
// so it grows and fills more of the frame the closer it gets.
function drawFighter(ctx, x, y, size, f) {
  ctx.save();
  ctx.translate(x, y);

  // engine glow trail
  ctx.fillStyle = 'rgba(255,160,80,0.35)';
  ctx.beginPath(); ctx.ellipse(0, size * 0.55, size * 0.1, size * 0.22, 0, 0, Math.PI * 2); ctx.fill();

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

function draw() {
  const c = canvas();
  const ctx = c.getContext('2d');
  if (game.view === 'bombardier') drawBombardier(ctx, c);
  else drawGunner(ctx, c);
}

/* ------------------------------------------- HUD ------------------------------------------- */

const ENGINE_ICON = { ok: '🟢', smoking: '🟡', dead: '🔴' };

function updateHud() {
  $('#score').textContent = game.score;
  $('#best').textContent = game.best;
  $('#hp').textContent = Math.round(game.hp);
  $('#bombs').textContent = game.bombsLeft;
  $('#viewLabel').textContent = game.view === 'bombardier' ? 'BOMBARDIER' : 'GUNNER';
  $('#btn-action').textContent = game.view === 'bombardier' ? 'Drop Bomb' : 'Fire';
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

function playTransitionSounds(before, after) {
  if (after.destroyedCount > before.destroyedCount) SFX.hitTarget();
  if (after.lastFlakHit !== before.lastFlakHit) SFX.flak();
  if (after.lastEngineHit !== before.lastEngineHit) SFX.engineHit();
  if (after.score > before.score && after.destroyedCount === before.destroyedCount) {
    // score jumped without a new target destroyed this frame -> a fighter kill
    if (after.fighterCount <= before.fighterCount) SFX.fighterKill();
  }
  if (after.fighterCount < before.fighterCount && after.score === before.score) SFX.planeHit();
  if (!before.gunLocked && after.gunLocked) SFX.overheat();
  if (!before.over && after.over) {
    if (game.win) SFX.missionWin();
    else if (game.crashed) SFX.crashed();
    else SFX.shotDown();
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
    update(game, dt);
    if (game.view === 'gunner' && game.input.fire && !game.gunLocked) {
      gunFireTimer -= dt;
      if (gunFireTimer <= 0) { SFX.gunFire(); gunFireTimer = 0.09; }
    } else {
      gunFireTimer = 0;
    }
    const after = snapshot();
    playTransitionSounds(prev, after);
    prev = after;
    updateHud();
    if (game.over) showEndOverlay();
  }
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
  sub.textContent = 'Choose your primary objective — hitting it scores double, and clearing it awards a completion bonus.';
  el.appendChild(sub);
  const grid = document.createElement('div');
  grid.className = 'briefing-grid';
  for (const type of Object.keys(TARGET_TYPES)) {
    const info = TARGET_TYPES[type];
    const card = document.createElement('button');
    card.className = 'target-card';
    card.innerHTML = `<div class="target-icon">${info.icon}</div><div class="target-name">${info.name}</div><div class="target-desc">${info.desc}</div><div class="target-value">${info.value} pts (x2 if primary)</div>`;
    bindTap(card, () => {
      SFX.click();
      chooseTarget(game, type);
      el.classList.remove('show');
      updateHud();
    });
    grid.appendChild(card);
  }
  el.appendChild(grid);
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

function doAction() {
  if (!game.briefingDone || game.over) return;
  if (game.view === 'bombardier') { if (dropBomb(game)) SFX.dropBomb(); }
  else setInput(game, { fire: true });
}

// Mouse tracks aim continuously on hover; touch requires a drag (no hover
// on touch), both via the unified Pointer Events API.
let pointerDown = false;
function aimFromEvent(e) {
  const c = canvas();
  const rect = c.getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width; // 0..1
  const lateral = (frac - 0.5) / 0.42;
  setAim(game, lateral);
}
function onCanvasPointerMove(e) {
  if (e.pointerType === 'mouse' || pointerDown) aimFromEvent(e);
}
function onCanvasPointerDown(e) {
  e.preventDefault();
  pointerDown = true;
  aimFromEvent(e);
  const c = canvas();
  if (c.setPointerCapture) { try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
}
function onCanvasPointerUp() { pointerDown = false; }

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
    if (e.key === ' ') { e.preventDefault(); doAction(); return; }
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

  const actionBtn = $('#btn-action');
  let firingHeld = false;
  actionBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!game.briefingDone || game.over) return;
    if (game.view === 'bombardier') { if (dropBomb(game)) SFX.dropBomb(); }
    else { firingHeld = true; setInput(game, { fire: true }); }
  });
  actionBtn.addEventListener('pointerup', () => { if (firingHeld) { firingHeld = false; setInput(game, { fire: false }); } });
  actionBtn.addEventListener('pointerleave', () => { if (firingHeld) { firingHeld = false; setInput(game, { fire: false }); } });

  bindTap($('#btn-view'), () => { toggleView(game); updateHud(); });
  bindTap($('#new-game-btn'), restart);
  bindTap($('#sound-btn'), () => setSoundOn(!soundOn));

  showBriefing();
  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', boot);
