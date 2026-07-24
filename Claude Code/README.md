# Euchre

A complete, single-page Euchre game — you vs. three AI opponents (your partner
and two opponents). Pure HTML/CSS/JS, no build step, no dependencies.

Implements full standard rules: 24-card deck, two rounds of bidding
(order-up / call-it, with stick-the-dealer), right & left bower, going alone,
follow-suit enforcement, trick-taking, and scoring to 10 points.

## Play locally

Just open `index.html` in a browser — or, since some browsers restrict
`file://` script loading, serve it locally:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Deploy to GitHub Pages

1. Create a new GitHub repo and push these files (`index.html`, `style.css`,
   `game.js`, `ui.js`) to the root of the default branch:

   ```
   git init
   git add index.html style.css game.js ui.js README.md
   git commit -m "Euchre"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Build and deployment → Source** → select
   "Deploy from a branch", branch `main`, folder `/ (root)` → Save.

3. Your game will be live at `https://<you>.github.io/<repo>/` within a
   minute or two.

## Files

- `index.html` — page structure
- `style.css` — table/card styling, responsive layout
- `game.js` — game engine: deck, dealing, bidding, trump/bower rules, trick
  resolution, scoring, and a heuristic AI for bidding/play
- `ui.js` — DOM rendering and the turn-by-turn controller wiring the engine
  to button clicks / card clicks
