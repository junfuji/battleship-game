import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_SIZE, FLEET, ORIENTATIONS, createBoard, cellKey, inBounds,
  shipCells, clippedShipCells, canPlaceShip, placeShip, clearShips,
  isFleetComplete, isSunk, fireAt, allSunk, remainingShips, randomPlacement,
} from '../game.js';
import { seededRandom } from './helpers.js';

const { HORIZONTAL: H, VERTICAL: V } = ORIENTATIONS;

test('boards have independent ship and shot state', () => {
  const first = createBoard();
  const second = createBoard();
  placeShip(first, 'Destroyer', 2, 0, 0, H);
  fireAt(first, 0, 0);
  assert.deepEqual(second, { ships: [], shots: new Set() });
  assert.equal(isFleetComplete(second), false);
  assert.equal(allSunk(second), false);
});

test('board bounds include corners and exclude cells beyond every edge', () => {
  for (const [row, col] of [[0, 0], [0, 9], [9, 0], [9, 9]]) {
    assert.equal(inBounds(row, col), true);
  }
  for (const [row, col] of [[-1, 0], [0, -1], [10, 0], [0, 10]]) {
    assert.equal(inBounds(row, col), false);
  }
  assert.equal(cellKey(2, 9), '2,9');
  assert.notEqual(cellKey(2, 9), cellKey(9, 2));
});

for (const { label, row, col, orientation, expected, overflow } of [
  { label: 'horizontal', row: 9, col: 7, orientation: H,
    expected: [{ row: 9, col: 7 }, { row: 9, col: 8 }, { row: 9, col: 9 }],
    overflow: [9, 8] },
  { label: 'vertical', row: 7, col: 9, orientation: V,
    expected: [{ row: 7, col: 9 }, { row: 8, col: 9 }, { row: 9, col: 9 }],
    overflow: [8, 9] },
]) {
  test(`${label} placement fits exactly at the edge and rejects overflow`, () => {
    assert.deepEqual(shipCells(row, col, 3, orientation), expected);
    assert.equal(canPlaceShip(createBoard(), row, col, 3, orientation), true);
    assert.equal(shipCells(...overflow, 3, orientation), null);
    assert.equal(canPlaceShip(createBoard(), ...overflow, 3, orientation), false);
  });

  test(`${label} illegal preview retains the visible cells at the edge`, () => {
    assert.deepEqual(clippedShipCells(...overflow, 3, orientation), expected.slice(1));
    assert.deepEqual(clippedShipCells(row, col, 3, orientation), expected);
    assert.deepEqual(clippedShipCells(10, 10, 3, orientation), []);
  });
}

test('placement rejects crossing and collinear overlaps but allows touching ships', () => {
  const board = createBoard();
  placeShip(board, 'Cruiser', 3, 3, 3, H);
  assert.equal(canPlaceShip(board, 2, 4, 3, V), false);
  assert.equal(canPlaceShip(board, 3, 5, 2, H), false);
  assert.equal(canPlaceShip(board, 4, 3, 3, H), true);
  assert.equal(canPlaceShip(board, 3, 6, 2, H), true);
  assert.equal(canPlaceShip(board, -1, 0, 2, V), false);
  assert.equal(canPlaceShip(board, 0, -1, 2, H), false);
});

test('illegal placement throws without changing the board', () => {
  const board = createBoard();
  assert.equal(placeShip(board, 'Destroyer', 2, 0, 0, H), board);
  const before = structuredClone(board);
  assert.throws(() => placeShip(board, 'Cruiser', 3, 0, 1, V), /Cannot place/);
  assert.deepEqual(board, before);
  assert.throws(() => placeShip(board, 'Carrier', 5, 9, 9, H), /Cannot place/);
  assert.deepEqual(board, before);
});

test('fleet completion and reset follow manual placement', () => {
  const board = createBoard();
  FLEET.forEach(({ name, length }, row) => {
    assert.equal(isFleetComplete(board), false);
    placeShip(board, name, length, row, 0, H);
  });
  assert.equal(isFleetComplete(board), true);
  assert.deepEqual(remainingShips(board), FLEET.map(({ name }) => name));
  assert.equal(clearShips(board), board);
  assert.deepEqual(board.ships, []);
  assert.equal(isFleetComplete(board), false);
  assert.equal(allSunk(board), false);
});

test('shots distinguish misses, hits, sinking, and victory', () => {
  const board = createBoard();
  placeShip(board, 'Destroyer', 2, 0, 0, H);
  placeShip(board, 'Cruiser', 3, 2, 0, H);
  assert.deepEqual(fireAt(board, 9, 9), { hit: false, row: 9, col: 9 });
  assert.deepEqual(fireAt(board, 0, 0), {
    hit: true, row: 0, col: 0, sunk: false, shipName: null,
  });
  assert.equal(isSunk(board.ships[0]), false);
  assert.deepEqual(fireAt(board, 0, 1), {
    hit: true, row: 0, col: 1, sunk: true, shipName: 'Destroyer',
  });
  assert.equal(isSunk(board.ships[0]), true);
  assert.deepEqual(remainingShips(board), ['Cruiser']);
  assert.equal(allSunk(board), false);
  for (let col = 0; col < 3; col++) fireAt(board, 2, col);
  assert.equal(allSunk(board), true);
  assert.deepEqual(remainingShips(board), []);
  assert.equal(board.shots.size, 6);
});

test('repeated misses and hits do not alter shot or damage state', () => {
  const board = createBoard();
  placeShip(board, 'Destroyer', 2, 0, 0, H);
  for (const [row, col] of [[9, 9], [0, 0], [0, 1]]) {
    fireAt(board, row, col);
    const before = structuredClone(board);
    assert.deepEqual(fireAt(board, row, col), { repeat: true });
    assert.deepEqual(board, before);
  }
});

test('random placement replaces existing ships with a legal standard fleet', () => {
  for (const seed of [1, 42, 2026, 123456789]) {
    const board = createBoard();
    placeShip(board, 'Old ship', 2, 0, 0, H);
    assert.equal(randomPlacement(board, seededRandom(seed)), board);
    assert.equal(isFleetComplete(board), true);
    assert.deepEqual(board.ships.map(({ name, length }) => ({ name, length })), FLEET);
    const occupied = new Set();
    for (const ship of board.ships) {
      assert.equal(ship.cells.length, ship.length);
      assert.equal(ship.hits.size, 0);
      const origin = ship.cells[0];
      ship.cells.forEach(({ row, col }, offset) => {
        assert.ok(row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE);
        assert.equal(row, origin.row + (ship.orientation === V ? offset : 0));
        assert.equal(col, origin.col + (ship.orientation === H ? offset : 0));
        assert.equal(occupied.has(cellKey(row, col)), false, `overlap for seed ${seed}`);
        occupied.add(cellKey(row, col));
      });
    }
    assert.equal(occupied.size, 17);
  }
});
