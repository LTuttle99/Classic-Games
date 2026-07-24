# Card Games

A small arcade of six classic card games, each playable against AI opponents.
Pure HTML/CSS/JS, no build step, no dependencies, no backend — everything
runs client-side and deploys as static files.

Open `index.html` for a hub page linking to each game:

| Game | Folder | What it is |
|---|---|---|
| Euchre | `euchre/` | Trick-taking partnership game — call trump, go alone, play to 10 points |
| Texas Hold'em | `poker/` | No-limit poker vs. 3 AI, blinds, community cards, real betting rounds, chip stacks persist |
| Blackjack | `blackjack/` | Beat the dealer — hit/stand/double, chip betting, chip balance persists |
| UNO | `uno/` | You + 3 AI, full action-card deck, scored rounds to 500 points |
| Solitaire | `solitaire/` | Classic Klondike, click-to-select-and-move, hint button, auto-finish |
| War | `war/` | Highest card wins, ties go to war, optional auto-play |

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
   git commit -m "Card games"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Build and deployment → Source** → select
   "Deploy from a branch", branch `main`, folder `/ (root)` → Save.

3. The site will be live at `https://<you>.github.io/<repo>/` within a
   minute or two, with each game reachable at `/euchre/`, `/poker/`,
   `/blackjack/`, `/uno/`, `/solitaire/`, `/war/`.

## Notes on scope / simplifications

- **Poker**: single main pot only — no side-pot splitting for uneven all-ins.
  A short-stacked all-in player is still eligible for the whole pot, which is
  a known simplification (fine for a casual free-chip game, not casino-exact
  for multi-way all-ins).
- **Blackjack**: no split-hand support (hit/stand/double only).
- **Chip balances** (Blackjack, Poker) persist in the browser's
  `localStorage`, so they survive a page reload but are local to that browser.
- AI opponents in every game use hand-tuned heuristics, not solved/optimal
  strategy — they play reasonably but are beatable.
