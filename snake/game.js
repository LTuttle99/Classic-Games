'use strict';

/* =========================================================================
   SNAKE — grid-tick movement, decoupled from rendering
   ========================================================================= */

const GRID = 20;
const START_LENGTH = 3;
const START_INTERVAL = 140; // ms per tick
const MIN_INTERVAL = 70;
const SPEEDUP_PER_FOOD = 3;
const BEST_KEY = 'snake-best';

function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ }
}

function newGame() {
  const mid = Math.floor(GRID / 2);
  const snake = [];
  for (let i = 0; i < START_LENGTH; i++) snake.push({ x: mid - i, y: mid });
  const game = {
    snake,               // head is index 0
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: null,
    score: 0,
    best: loadBest(),
    interval: START_INTERVAL,
    over: false,
  };
  placeFood(game);
  return game;
}

function placeFood(game) {
  const occupied = new Set(game.snake.map(s => `${s.x},${s.y}`));
  const free = [];
  for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) {
    if (!occupied.has(`${x},${y}`)) free.push({ x, y });
  }
  if (free.length === 0) { game.food = null; return; }
  game.food = free[Math.floor(Math.random() * free.length)];
}

function setDirection(game, dx, dy) {
  // ignore 180-degree reversals and no-ops
  if (game.dir.x === -dx && game.dir.y === -dy) return;
  if (dx === 0 && dy === 0) return;
  game.nextDir = { x: dx, y: dy };
}

function tick(game) {
  if (game.over) return;
  game.dir = game.nextDir;

  const head = game.snake[0];
  const newHead = { x: head.x + game.dir.x, y: head.y + game.dir.y };

  if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
    game.over = true;
    return;
  }
  const willEat = game.food && newHead.x === game.food.x && newHead.y === game.food.y;
  const bodyToCheck = willEat ? game.snake : game.snake.slice(0, -1);
  if (bodyToCheck.some(s => s.x === newHead.x && s.y === newHead.y)) {
    game.over = true;
    return;
  }

  game.snake.unshift(newHead);
  if (willEat) {
    game.score++;
    if (game.score > game.best) { game.best = game.score; saveBest(game.best); }
    game.interval = Math.max(MIN_INTERVAL, game.interval - SPEEDUP_PER_FOOD);
    placeFood(game);
  } else {
    game.snake.pop();
  }
}
