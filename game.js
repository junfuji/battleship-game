// game.js — pure Battleship game logic. No DOM access.
// State is plain data so it can be constructed and inspected in the console.

export const BOARD_SIZE = 10;

// Column letters A-J map to indices 0-9; rows are 1-10.
export const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// Standard fleet: name -> length.
export const FLEET = [
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Destroyer', length: 2 },
];

export const ORIENTATIONS = { HORIZONTAL: 'horizontal', VERTICAL: 'vertical' };

// Create an empty board state.
// ships: array of { name, length, cells: [{row,col}], hits: Set-like array of "r,c" }
// shots: Set of "r,c" strings already fired AT this board.
export function createBoard() {
  return {
    ships: [],
    shots: new Set(),
  };
}

// Turn a cell into a stable key.
export function cellKey(row, col) {
  return `${row},${col}`;
}

export function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

// Compute the list of cells a ship of `length` would occupy from an origin.
// Returns null if any cell falls off the board.
export function shipCells(row, col, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    const r = orientation === ORIENTATIONS.VERTICAL ? row + i : row;
    const c = orientation === ORIENTATIONS.HORIZONTAL ? col + i : col;
    if (!inBounds(r, c)) return null;
    cells.push({ row: r, col: c });
  }
  return cells;
}

// The ship's intended cells clipped to the board (off-board cells dropped).
// Unlike shipCells this never returns null, so callers can render the on-board
// portion of an out-of-bounds placement. Legality is decided by canPlaceShip.
export function clippedShipCells(row, col, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    const r = orientation === ORIENTATIONS.VERTICAL ? row + i : row;
    const c = orientation === ORIENTATIONS.HORIZONTAL ? col + i : col;
    if (inBounds(r, c)) cells.push({ row: r, col: c });
  }
  return cells;
}

// Placement is legal when every cell is on-board and none overlaps an existing
// ship. Ships touching edge-to-edge is allowed, so we only reject exact overlaps.
export function canPlaceShip(board, row, col, length, orientation) {
  const cells = shipCells(row, col, length, orientation);
  if (!cells) return false;
  const occupied = new Set();
  for (const ship of board.ships) {
    for (const cell of ship.cells) occupied.add(cellKey(cell.row, cell.col));
  }
  return cells.every((cell) => !occupied.has(cellKey(cell.row, cell.col)));
}

// Place a ship; throws if illegal so callers can rely on validated state.
export function placeShip(board, name, length, row, col, orientation) {
  if (!canPlaceShip(board, row, col, length, orientation)) {
    throw new Error(`Cannot place ${name} at ${row},${col}`);
  }
  const cells = shipCells(row, col, length, orientation);
  board.ships.push({ name, length, orientation, cells, hits: new Set() });
  return board;
}

// Remove every placed ship (used by "Reset placement").
export function clearShips(board) {
  board.ships = [];
  return board;
}

export function isFleetComplete(board) {
  return board.ships.length === FLEET.length;
}

// Find the ship occupying a cell, if any.
function shipAt(board, row, col) {
  const key = cellKey(row, col);
  return board.ships.find((ship) =>
    ship.cells.some((cell) => cellKey(cell.row, cell.col) === key)
  );
}

export function isSunk(ship) {
  return ship.hits.size === ship.length;
}

// Fire at a cell on `board`. Returns a result describing what happened.
// Repeat shots return { repeat: true } and do NOT consume a turn.
export function fireAt(board, row, col) {
  const key = cellKey(row, col);
  if (board.shots.has(key)) return { repeat: true };
  board.shots.add(key);

  const ship = shipAt(board, row, col);
  if (!ship) return { hit: false, row, col };

  ship.hits.add(key);
  const sunk = isSunk(ship);
  return { hit: true, row, col, sunk, shipName: sunk ? ship.name : null };
}

// True when every ship on the board is sunk.
export function allSunk(board) {
  return board.ships.length > 0 && board.ships.every(isSunk);
}

// Ships still afloat, for the remaining-ships UI list.
export function remainingShips(board) {
  return board.ships.filter((ship) => !isSunk(ship)).map((ship) => ship.name);
}

// Place the whole standard fleet at random legal positions.
export function randomPlacement(board, rng = Math.random) {
  clearShips(board);
  for (const { name, length } of FLEET) {
    let placed = false;
    while (!placed) {
      const orientation =
        rng() < 0.5 ? ORIENTATIONS.HORIZONTAL : ORIENTATIONS.VERTICAL;
      const row = Math.floor(rng() * BOARD_SIZE);
      const col = Math.floor(rng() * BOARD_SIZE);
      if (canPlaceShip(board, row, col, length, orientation)) {
        placeShip(board, name, length, row, col, orientation);
        placed = true;
      }
    }
  }
  return board;
}
