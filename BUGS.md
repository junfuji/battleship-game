# Bugs found and fixed

- Play: https://junfuji.github.io/battleship-game/
- Build that still contains the bug below: https://junfuji.github.io/battleship-game/buggy/

I tested with boundary values rather than by playing normal games — placing ships at the
edges of the board, where the arithmetic is most likely to be wrong. That is what found
the bug; a complete game never touches this code path.

## Illegal placement gave no feedback at the board edge (fixed)

**Symptom.** During placement, hovering a ship that would extend past the edge of the
board showed nothing at all — no highlight, no error. Hovering a position that overlapped
an already-placed ship correctly showed the red "illegal" preview. One class of illegal
placement was reported; the other was silently ignored.

**How I found it.** With a horizontal Carrier selected, I hovered over columns H–J, where
it cannot fit. Nothing rendered. The asymmetry is what gave it away: the same category of
error produced two different behaviors depending on *why* it was illegal, which pointed at
the rendering path rather than the validation logic.

**Root cause.** `shipCells()` was doing two jobs — computing which cells a ship occupies,
and validating that they are on the board — returning `null` when any cell fell outside
the grid. The renderer guarded on that:

```js
const cells = shipCells(row, col, length, orientation);   // null if off-board
const legal = canPlaceShip(board, row, col, length, orientation);

if (cells) {                          // <- off-board hover stops here
  for (const c of cells) {
    cell.classList.add(legal ? 'preview-ok' : 'preview-bad');
  }
}
```

So an off-board hover skipped the whole render block. Note `legal` was already computed
above the guard: the code knew the placement was illegal, it just had no cells left to say
it with. `null` was carrying two meanings — *"this is invalid"* and *"there is nothing to
draw"* — and the UI could only report the first if it was handed the second.

**Fix.** Added a geometry-only function that never returns `null`; it drops the cells that
fall outside the board and leaves legality entirely to `canPlaceShip()`.

```js
const cells = clippedShipCells(row, col, length, orientation);  // never null
const legal = canPlaceShip(board, row, col, length, orientation);

for (const c of cells) {              // <- always paints the on-board portion
  cell.classList.add(legal ? 'preview-ok' : 'preview-bad');
}
```

`shipCells()` itself was left alone — `canPlaceShip()` and `placeShip()` depend on its
off-board-means-`null` behavior, and it is correct for them. Only the renderer needed cells
for an invalid placement.

Both classes of illegal placement now go through the same render path, so neither can go
silent again. Re-testing all four edges also turned up that overflow toward the top and
left is unreachable by design: ships extend from their origin toward increasing row and
column, so only two of the four edges can ever overflow.

## Also identified, not fixed

Found in a code review afterwards, and left as known issues.

- **The AI conflates adjacent ships.** `ai.hits` doesn't track which ship each hit belongs
  to, so a hit on one ship and a hit on the ship next to it are treated as one vessel. The
  AI infers a false orientation and discards the real ship's remaining candidates.
- **`clearShips()` resets ships but not shots.** Unreachable today because `newGame()`
  builds fresh boards, but it would surface the moment a board is reused.
- **"Random placement" doesn't clear the placement preview.** With a preview still active,
  `FLEET[placeIndex]` is out of range and the render throws. Usually masked by `mouseleave`
  when using a mouse; reachable via keyboard.

The last two are the same class of defect: state initialised in one code path and not in
another.
