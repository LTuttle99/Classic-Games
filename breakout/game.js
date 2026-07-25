'use strict';

/* =========================================================================
   BREAKOUT — real-time physics, decoupled from rendering
   ========================================================================= */

const W = 640;
const H = 480;
const PADDLE_W = 90;
const PADDLE_H = 14;
const PADDLE_Y = H - 30;
const PADDLE_SPEED = 520;
const BALL_R = 7;
const BALL_START_SPEED = 300;
const BALL_MAX_SPEED = 560;
const BALL_SPEED_STEP_PER_LEVEL = 20;

const BRICK_ROWS = 5;
const BRICK_COLS = 10;
const BRICK_H = 22;
const BRICK_GAP = 4;
const BRICK_TOP = 50;
const BRICK_SIDE_MARGIN = 20;
const ROW_COLORS = ['#e5453f', '#f0a13a', '#f0d43a', '#5fd15c', '#4d7dea'];
const ROW_POINTS = [50, 40, 30, 20, 10]; // top row worth the most

function brickWidth() {
  return (W - 2 * BRICK_SIDE_MARGIN - (BRICK_COLS - 1) * BRICK_GAP) / BRICK_COLS;
}

function makeBricks() {
  const bricks = [];
  const bw = brickWidth();
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: BRICK_SIDE_MARGIN + c * (bw + BRICK_GAP),
        y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
        w: bw, h: BRICK_H,
        alive: true,
        color: ROW_COLORS[r % ROW_COLORS.length],
        points: ROW_POINTS[r % ROW_POINTS.length],
      });
    }
  }
  return bricks;
}

function loadBest() {
  try { return parseInt(localStorage.getItem('breakout-best'), 10) || 0; } catch (e) { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem('breakout-best', String(n)); } catch (e) { /* ignore */ }
}

function newGame() {
  const game = {
    paddle: { x: W / 2 - PADDLE_W / 2 },
    ball: { x: W / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, speed: BALL_START_SPEED },
    bricks: makeBricks(),
    score: 0,
    best: loadBest(),
    lives: 3,
    level: 1,
    launched: false,
    over: false,
    won: false, // true only when the whole run is deliberately ended in victory (unused; levels loop)
  };
  return game;
}

function launchBall(game) {
  if (game.launched || game.over) return;
  const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3); // mostly upward, slight random angle
  game.ball.vx = Math.cos(angle) * game.ball.speed;
  game.ball.vy = Math.sin(angle) * game.ball.speed;
  game.launched = true;
}

function resetBallOnPaddle(game) {
  game.ball.x = game.paddle.x + PADDLE_W / 2;
  game.ball.y = PADDLE_Y - BALL_R - 1;
  game.ball.vx = 0;
  game.ball.vy = 0;
  game.launched = false;
}

function clampPaddle(x) {
  return Math.max(0, Math.min(W - PADDLE_W, x));
}

function update(game, dt, input) {
  if (game.over) return;

  if (input.targetX !== null && input.targetX !== undefined) {
    const desired = clampPaddle(input.targetX - PADDLE_W / 2);
    const diff = desired - game.paddle.x;
    const maxStep = PADDLE_SPEED * dt * 1.6;
    game.paddle.x += Math.max(-maxStep, Math.min(maxStep, diff));
  } else {
    game.paddle.x += (input.left ? -1 : 0) * PADDLE_SPEED * dt;
    game.paddle.x += (input.right ? 1 : 0) * PADDLE_SPEED * dt;
  }
  game.paddle.x = clampPaddle(game.paddle.x);

  if (!game.launched) {
    game.ball.x = game.paddle.x + PADDLE_W / 2;
    game.ball.y = PADDLE_Y - BALL_R - 1;
    return;
  }

  const b = game.ball;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x - BALL_R <= 0) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
  if (b.x + BALL_R >= W) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }
  if (b.y - BALL_R <= 0) { b.y = BALL_R; b.vy = Math.abs(b.vy); }

  // paddle collision (only when moving downward)
  if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y + BALL_R <= PADDLE_Y + PADDLE_H + 10 &&
      b.x >= game.paddle.x - BALL_R && b.x <= game.paddle.x + PADDLE_W + BALL_R) {
    const hitPos = (b.x - (game.paddle.x + PADDLE_W / 2)) / (PADDLE_W / 2); // -1..1
    const angle = -Math.PI / 2 + hitPos * (Math.PI / 3);
    b.vx = Math.cos(angle) * b.speed;
    b.vy = Math.sin(angle) * b.speed;
    b.y = PADDLE_Y - BALL_R - 0.1;
  }

  // brick collisions — resolve at most one per frame to keep the physics simple/stable
  for (const brick of game.bricks) {
    if (!brick.alive) continue;
    const closestX = Math.max(brick.x, Math.min(b.x, brick.x + brick.w));
    const closestY = Math.max(brick.y, Math.min(b.y, brick.y + brick.h));
    const dx = b.x - closestX, dy = b.y - closestY;
    if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

    brick.alive = false;
    game.score += brick.points;
    if (game.score > game.best) { game.best = game.score; saveBest(game.best); }

    const overlapLeft = (b.x + BALL_R) - brick.x;
    const overlapRight = (brick.x + brick.w) - (b.x - BALL_R);
    const overlapTop = (b.y + BALL_R) - brick.y;
    const overlapBottom = (brick.y + brick.h) - (b.y - BALL_R);
    const minX = Math.min(overlapLeft, overlapRight);
    const minY = Math.min(overlapTop, overlapBottom);
    if (minX < minY) b.vx *= -1; else b.vy *= -1;
    break;
  }

  if (game.bricks.every(br => !br.alive)) {
    nextLevel(game);
    return;
  }

  if (b.y - BALL_R > H) {
    game.lives--;
    if (game.lives <= 0) {
      game.over = true;
    } else {
      resetBallOnPaddle(game);
    }
  }
}

function nextLevel(game) {
  game.level++;
  game.bricks = makeBricks();
  game.ball.speed = Math.min(BALL_MAX_SPEED, BALL_START_SPEED + (game.level - 1) * BALL_SPEED_STEP_PER_LEVEL);
  resetBallOnPaddle(game);
}
