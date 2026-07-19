# Battleship

A browser-based Battleship game — player vs. AI — built with **vanilla HTML, CSS,
and JavaScript (ES modules)**. No frameworks, no bundler, no build step, no
backend, no external dependencies.

## Play

- **Live (GitHub Pages):** _https://junfuji.github.io/battleship-game/_ (placeholder — update once Pages is enabled)

### Run locally

Because the game uses ES modules, browsers require it to be served over HTTP
(opening `index.html` via `file://` will be blocked by module CORS rules in most
browsers). Use any static server from the repo root:

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000
```

Or use the VS Code "Live Server" extension, or any other static file server.

## How to play

1. **Placement:** Place your five ships on your grid by clicking. Use **Rotate**
   to switch between horizontal/vertical. A green preview means the spot is legal,
   red means it isn't. Or use **Random placement**. **Reset placement** clears the
   board. Play starts once the full fleet is placed.
2. **Combat:** Click a cell on the **Enemy waters** grid to fire, then the AI
   fires back. Hits, misses, and sunk ships are shown, and the status line
   narrates each turn.
3. The game ends when one side's entire fleet is sunk. Click **New game** to
   restart.

## Fleet

| Ship       | Length |
| ---------- | ------ |
| Carrier    | 5      |
| Battleship | 4      |
| Cruiser    | 3      |
| Submarine  | 3      |
| Destroyer  | 2      |

Ships are placed horizontally or vertically, fully on-board, and never overlap.
Ships touching edge-to-edge is allowed.

## Project structure

| File         | Responsibility                                                        |
| ------------ | -------------------------------------------------------------------- |
| `index.html` | Markup and module bootstrap.                                          |
| `styles.css` | All styling.                                                          |
| `game.js`    | **Pure** game logic — board, fleet, placement validation, firing, sink detection. No DOM. |
| `ai.js`      | **Pure** AI opponent — hunt/target strategy. No DOM.                 |
| `ui.js`      | All DOM rendering, placement UI, and turn handling.                  |

`game.js` and `ai.js` are DOM-free and export their functions, so game/AI state
can be constructed and inspected directly in the browser console for debugging.

## AI strategy

- **Hunt mode:** with no unresolved hits, the AI fires at a random untried cell on
  a parity pattern (`(row + col) % 2 === 0`). Since the smallest ship is 2 cells
  long, every ship must cover at least one parity cell — this halves the search space.
- **Target mode:** after a hit, the AI queues the orthogonally adjacent cells.
  Once two hits line up, it infers the orientation and extends along that axis in
  both directions, discarding perpendicular candidates.
- When a ship is sunk, the target queue is cleared and the AI returns to hunt mode.
- The AI never fires at the same cell twice, never targets off-board cells, and
  **never reads the player's ship positions** — it only knows its own shot results.

## Deploy to GitHub Pages

All files live at the repo root, so no configuration is needed:

1. Push to `main`.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Select branch `main` and folder `/ (root)`, then **Save**.
4. The game will be served at `https://<user>.github.io/battleship-game/`.
