# Bugs found and fixed

This document covers what broke, how I found it, and what I did about it.

- Play the game: https://junfuji.github.io/battleship-game/
- A build that still contains the main bug, for comparison: https://junfuji.github.io/battleship-game/buggy/

## How I worked

I defined the spec, the constraints, and the definition of done, then delegated the
implementation to Devin. Testing and diagnosis were mine: I drove the app by hand,
took the observed behavior and the relevant code to Claude to work out the cause and
draft a targeted fix prompt, then ran that prompt in Devin and re-tested every edge case.

I tested with boundary values rather than by playing normal games — placing ships at the
edges of the board, where the arithmetic is most likely to be wrong. That is what surfaced
the bug below. A complete game never touches this code path.

---

## 1. Illegal ship placement gave no feedback at the board edge (fixed)

**Symptom**

During the placement phase, hovering a ship in a position where it would extend past the
edge of the board showed nothing at all — no highlight, no error, no feedback of any kind.

Hovering a position that overlapped an already-placed ship correctly showed the red
"illegal" preview. So one class of illegal placement was reported and the other was
silently ignored.

The spec called for a live preview showing whether a position is legal. Half of it was
missing.

**How I found it**

Boundary-value testing. With a horizontal Carrier (5 cells) selected, I hovered over
columns H, I and J, where the ship cannot fit. Nothing rendered.

The asymmetry is what gave it away: the same category of error — an illegal placement —
produced two completely different behaviors depending on *why* it was illegal. That
pointed at the rendering path rather than at the validation logic.

**Reproduction**

1. Open the game (placement phase, Carrier selected, orientation horizontal)
2. Hover over column H, I or J on your own grid
3. Expected: the on-board cells highlight red. Actual: nothing renders
4. For contrast, place a ship, then hover another ship so it overlaps — the red preview
   appears correctly

**Root cause**

`shipCells()` in `game.js` was doing two jobs at once: computing which cells a ship would
occupy, *and* validating that they are on the board. When any cell fell outside the grid
it returned `null`.

`ui.js` guarded the preview rendering on that return value:

```js
const cells = shipCells(row, col, length, orientation);   // null if off-board
const legal = canPlaceShip(board, row, col, length, orientation);

if (cells) {                          // <- off-board hover stops here
  for (const c of cells) {
    cell.classList.add(legal ? 'preview-ok' : 'preview-bad');
  }
}
```

So an off-board hover skipped the entire render block and nothing was painted.

Note that `legal` was already computed *above* the guard. The code knew the placement was
illegal — it just had no cells left to say it with. Overlap still turned red because in
that case every cell was on the board: the UI was handed a real list and could colour it.

The underlying problem is that `null` was carrying two different meanings — *"this
placement is invalid"* and *"there is nothing to draw"* — and the UI could only report the
first if it was given the second.

**Fix**

Added a geometry-only function that never returns `null`; it simply drops the cells that
fall outside the board. Legality stays entirely with `canPlaceShip()`.

```js
const cells = clippedShipCells(row, col, length, orientation);  // never null
const legal = canPlaceShip(board, row, col, length, orientation);

for (const c of cells) {              // <- always paints the on-board portion
  cell.classList.add(legal ? 'preview-ok' : 'preview-bad');
}
```

`shipCells()` itself was left untouched, because `canPlaceShip()` and `placeShip()` rely
on its off-board-means-`null` behavior and it is correct for them. The renderer simply
had a different requirement — it needs cells even when the placement is invalid.

**Verification and prevention**

Both classes of illegal placement now flow through the same render path, so neither can
go silent again.

Re-testing all four edges after the fix turned up something worth recording: overflow
toward the **top** and **left** is unreachable by design. Ships extend from their origin
toward increasing row and column, so only the right and bottom edges can ever overflow.
Two of the four cases I set out to test do not exist.

---

## Also identified, not fixed

These came out of a code review after the fix above. I triaged them as out of scope for
this exercise and left them as known issues rather than fixing them silently.

### 2. The AI conflates two adjacent ships

`ai.js` tracks unresolved hits in a single list (`ai.hits`) without distinguishing which
ship each hit belongs to. Because ships are allowed to sit next to each other, a hit on
one ship and a hit on the ship beside it get treated as the same vessel.

The AI then infers an orientation from those two hits and, in `extendAlongLine()`,
filters the target queue down to that axis — discarding the queued cells belonging to the
ship it actually hit first. When one of the two ships is sunk, `ai.hits` and `ai.queue`
are both cleared, so the unresolved hits on the *other* ship are forgotten entirely.

The effect is that the AI plays noticeably worse in a way that looks like bad luck rather
than a bug. A fix would mean grouping hits into connected clusters and clearing only the
cluster belonging to the sunk ship.

### 3. `clearShips()` resets ships but not shots

`createBoard()` initialises both `ships` and `shots`. `clearShips()` only empties `ships`,
leaving `shots` populated.

This is unreachable today, because `newGame()` builds fresh boards via `createBoard()`
rather than reusing them. It would surface the moment any code path reuses a board instead
of rebuilding it — the new game would treat previously-fired cells as already shot.

### 4. Placement preview state is not cleared by "Random placement"

`resetPlacement()` and `onPlayerCellClick()` both clear `state.preview`;
`doRandomPlacement()` does not, and it sets `placeIndex` to `FLEET.length`.

If a preview is still active when that runs, `renderPlayerBoard()` evaluates
`FLEET[state.placeIndex]` — index 5 in a 5-element array — and throws a `TypeError`
during render. With a mouse this is usually masked, because moving the pointer to the
button fires `mouseleave` and clears the preview first. It is reachable via keyboard
(tab to the button and press Enter with the pointer still over the grid).

Issues 3 and 4 are the same class of defect: state that is initialised in one code path
and not in another.
