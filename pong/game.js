'use strict';

/* =========================================================================
   PONG — real-time physics, decoupled from rendering
   Coordinate space is a fixed logical box W x H; ui.js scales to canvas.
   ========================================================================= */

const W = 640;
const H = 400;
const PADDLE_W = 12;
const PADDLE_H = 80;
const PADDLE_SPEED = 420;      // px/sec, player keyboard + AI max speed
const BALL_SIZE = 10;
const BALL_START_SPEED = 260;
const BALL_SPEED_STEP = 18;    // added on each paddle hit
const BALL_MAX_SPEED = 620;
const WIN_SCORE = 7;

function newGame() {
  const game = {
    player: { y: H / 2 - PADDLE_H / 2, targetY: null },
    ai: { y: H / 2 - PADDLE_H / 2 },
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: BALL_START_SPEED },
    scores: { player: 0, ai: 0 },
    winner: null,
    running: true,
  };
  serve(game, Math.random() < 0.5 ? 1 : -1);
  return game;
}

function serve(game, direction) {
  const angle = (Math.random() * 0.6 - 0.3); // radians, slight up/down bias
  game.ball.speed = BALL_START_SPEED;
  game.ball.x = W / 2;
  game.ball.y = H / 2;
  game.ball.vx = Math.cos(angle) * game.ball.speed * direction;
  game.ball.vy = Math.sin(angle) * game.ball.speed;
}

function clampPaddle(y) {
  return Math.max(0, Math.min(H - PADDLE_H, y));
}

function update(game, dt, input) {
  if (!game.running) return;

  // player paddle: either follows a target Y (mouse/touch) or keyboard velocity
  if (input.targetY !== null && input.targetY !== undefined) {
    const desired = clampPaddle(input.targetY - PADDLE_H / 2);
    const diff = desired - game.player.y;
    const maxStep = PADDLE_SPEED * dt * 1.6;
    game.player.y += Math.max(-maxStep, Math.min(maxStep, diff));
  } else {
    game.player.y += (input.up ? -1 : 0) * PADDLE_SPEED * dt;
    game.player.y += (input.down ? 1 : 0) * PADDLE_SPEED * dt;
  }
  game.player.y = clampPaddle(game.player.y);

  // AI paddle: track the ball with a capped speed, ease toward center when ball moves away
  const aiCenter = game.ai.y + PADDLE_H / 2;
  const target = game.ball.vx > 0 ? game.ball.y : H / 2;
  const diff = target - aiCenter;
  const maxStep = PADDLE_SPEED * 0.82 * dt;
  game.ai.y += Math.max(-maxStep, Math.min(maxStep, diff));
  game.ai.y = clampPaddle(game.ai.y);

  // ball movement
  const b = game.ball;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.y <= BALL_SIZE / 2) { b.y = BALL_SIZE / 2; b.vy = Math.abs(b.vy); }
  if (b.y >= H - BALL_SIZE / 2) { b.y = H - BALL_SIZE / 2; b.vy = -Math.abs(b.vy); }

  // player paddle collision (left side)
  if (b.vx < 0 && b.x - BALL_SIZE / 2 <= PADDLE_W && b.x - BALL_SIZE / 2 > 0 &&
      b.y >= game.player.y && b.y <= game.player.y + PADDLE_H) {
    bounce(game, game.player, 1);
  }
  // AI paddle collision (right side)
  if (b.vx > 0 && b.x + BALL_SIZE / 2 >= W - PADDLE_W && b.x + BALL_SIZE / 2 < W &&
      b.y >= game.ai.y && b.y <= game.ai.y + PADDLE_H) {
    bounce(game, game.ai, -1);
  }

  // scoring
  if (b.x < -BALL_SIZE) {
    game.scores.ai++;
    checkWin(game) || serve(game, 1);
  } else if (b.x > W + BALL_SIZE) {
    game.scores.player++;
    checkWin(game) || serve(game, -1);
  }
}

function bounce(game, paddle, direction) {
  const b = game.ball;
  const hitPos = (b.y - (paddle.y + PADDLE_H / 2)) / (PADDLE_H / 2); // -1..1
  const angle = hitPos * (Math.PI / 3); // up to 60 degrees
  b.speed = Math.min(BALL_MAX_SPEED, b.speed + BALL_SPEED_STEP);
  b.vx = Math.cos(angle) * b.speed * direction;
  b.vy = Math.sin(angle) * b.speed;
  b.x = direction > 0 ? PADDLE_W + BALL_SIZE / 2 + 0.1 : W - PADDLE_W - BALL_SIZE / 2 - 0.1;
}

function checkWin(game) {
  if (game.scores.player >= WIN_SCORE) { game.winner = 'player'; game.running = false; return true; }
  if (game.scores.ai >= WIN_SCORE) { game.winner = 'ai'; game.running = false; return true; }
  return false;
}
