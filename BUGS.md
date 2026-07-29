# Bugs found and fixed

- Play: https://junfuji.github.io/battleship-game/
- Build that still contains the bug: https://junfuji.github.io/battleship-game/buggy/

I tested with boundary values rather than by playing normal games — placing ships at the
edges of the board. A complete game never touches this code path.

## Illegal placement gave no feedback at the board edge (fixed)

**Symptom.** Hovering a ship that would extend past the edge of the board showed nothing
at all. Hovering one that overlapped an already-placed ship correctly showed the red
"illegal" preview. One kind of illegal placement was reported; the other was silent.

**How I found it.** With a horizontal Carrier selected, I hovered over columns H–J, where
it cannot fit. The asymmetry is what gave it away — the same category of error behaved
differently depending on *why* it was illegal, which pointed at the rendering path rather
than the validation logic.

**Root cause.** `shipCells()` returns `null` when any cell falls outside the board, and
the renderer used that as its guard:

```js
const cells = shipCells(row, col, length, orientation);   // null if off-board
const legal = canPlaceShip(board, row, col, length, orientation);

if (cells) {                          // <- off-board hover stops here
  for (const c of cells) {
    cell.classList.add(legal ? 'preview-ok' : 'preview-bad');
  }
}
```

The one case where `shipCells()` returns nothing is exactly the case that needed an
"illegal" preview drawn. Overlap worked because all of its cells are on the board, so the
guard passed and `canPlaceShip()` coloured them red. `legal` was already computed above
the guard: the code knew the placement was illegal, it just had no cells left to say it
with.

**Fix.** Added a second function that computes the same geometry but never returns
`null` — it drops the cells outside the board — and pointed the renderer at it.

```js
const cells = clippedShipCells(row, col, length, orientation);  // never null
```

`shipCells()` was left alone; `canPlaceShip()` and `placeShip()` depend on its
off-board-means-`null` behavior. Only the renderer needed cells for an invalid placement.

Re-testing all four edges also showed that overflow toward the top and left is unreachable
by design: ships extend toward increasing row and column, so only two edges can overflow.
