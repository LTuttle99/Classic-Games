# Game Arcade

Fourteen classic games, each playable against AI (or solo). Pure HTML/CSS/JS,
no build step, no dependencies, no backend — everything runs client-side and
deploys as static files.

Open `index.html` for a hub page linking to each game.

## Cards

| Game | Folder | What it is |
|---|---|---|
| Euchre | `euchre/` | Trick-taking partnership game — call trump, go alone, play to 10 points |
| Texas Hold'em | `poker/` | No-limit poker vs. 3 AI, blinds, community cards, real betting rounds, chip stacks persist |
| Blackjack | `blackjack/` | Beat the dealer — hit/stand/double, chip betting, chip balance persists |
| UNO | `uno/` | You + 3 AI, full action-card deck, scored rounds to 500 points |
| Solitaire | `solitaire/` | Classic Klondike, click-to-select-and-move, hint button, auto-finish |
| War | `war/` | Highest card wins, ties go to war, optional auto-play |

## Board & Puzzle

| Game | Folder | What it is |
|---|---|---|
| Checkers | `checkers/` | Standard rules — mandatory capture, multi-jump chains, kings, alpha-beta AI |
| Connect Four | `connect4/` | Drop discs, four-in-a-row, alpha-beta AI with a heuristic evaluator |
| Tic-Tac-Toe | `tictactoe/` | Perfect-play minimax AI — unbeatable, best you can do is draw |
| 2048 | `2048/` | Sliding tile merge game, arrow keys or swipe, best score saved locally |
| Memory | `memory/` | Flip-and-match concentration game, easy/hard grid sizes, move + time tracking |

## Arcade

| Game | Folder | What it is |
|---|---|---|
| Tetris | `tetris/` | 7-bag randomizer, next-piece preview, ghost piece, increasing speed |
| Snake | `snake/` | Grid-tick movement, on-screen D-pad + keyboard, speeds up as you grow |
| Pong | `pong/` | Real-time physics, mouse/touch/keyboard paddle control, first to 7 |

Each game is fully self-contained in its own folder (`index.html`, `style.css`,
`game.js` for engine/AI, `ui.js` for rendering) — nothing is shared between
them, so any one of them can be copied out or modified independently.

## Play locally

Any static file server works, from the repo root:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

(Opening `index.html` directly via `file://` mostly works too, but some
browsers restrict script loading over `file://`, so a local server is more
reliable.)

## Deploy to GitHub Pages

1. Push the whole repo to GitHub, with `index.html` at the root of the
   default branch:

   ```
   git init
   git add .
   git commit -m "Game arcade"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Build and deployment → Source** → select
   "Deploy from a branch", branch `main`, folder `/ (root)` → Save.

3. The site will be live at `https://<you>.github.io/<repo>/` within a
   minute or two, with each game reachable at `/euchre/`, `/poker/`,
   `/checkers/`, `/tetris/`, etc.

### Uploading by drag-and-drop instead of git

GitHub's repo page also supports **Add file → Upload files**, where you can
drag files straight from Finder/Explorer. If you use that route, drag the
*contents* of this folder (select-all inside it), not the folder itself —
dragging the folder nests everything one level deeper and `index.html` won't
be found at the repo root.

## Notes on scope / simplifications

- **Poker**: single main pot only — no side-pot splitting for uneven all-ins.
  A short-stacked all-in player is still eligible for the whole pot, which is
  a known simplification (fine for a casual free-chip game, not casino-exact
  for multi-way all-ins).
- **Blackjack**: no split-hand support (hit/stand/double only).
- **Tetris**: simplified (non-SRS) rotation system with basic wall kicks, no
  hold piece, single next-piece preview.
- **Chip balances** (Blackjack, Poker) and **best scores** (2048, Snake,
  Tetris) persist in the browser's `localStorage`, so they survive a page
  reload but are local to that browser.
- AI opponents in every game use hand-tuned heuristics or minimax search, not
  a single unified engine — Tic-Tac-Toe and Checkers/Connect Four use
  (alpha-beta) minimax and play very strong; Euchre, Hold'em, and UNO use
  scoring heuristics and are beatable.
