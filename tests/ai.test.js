import test from 'node:test';
import assert from 'node:assert/strict';
import { createAI, nextShot, registerResult } from '../ai.js';
import { createBoard, randomPlacement, fireAt, allSunk } from '../game.js';
import { seededRandom } from './helpers.js';

test('AI instances do not share memory', () => {
  const first = createAI();
  const second = createAI();
  registerResult(first, 4, 4, { hit: true, sunk: false });
  assert.deepEqual(second, { tried: new Set(), queue: [], hits: [] });
});

test('hunt uses every parity cell before falling back, without repeating shots', () => {
  const ai = createAI();
  const rng = seededRandom(42);
  const seen = new Set();
  for (let turn = 0; turn < 100; turn++) {
    const { row, col } = nextShot(ai, rng);
    assert.ok(row >= 0 && row < 10 && col >= 0 && col < 10);
    assert.equal((row + col) % 2, turn < 50 ? 0 : 1);
    const key = `${row},${col}`;
    assert.equal(seen.has(key), false);
    seen.add(key);
    registerResult(ai, row, col, { hit: false });
  }
  assert.equal(seen.size, 100);
  assert.equal(nextShot(ai, rng), undefined);
});

for (const [row, col] of [[0, 0], [0, 9], [9, 0], [9, 9], [4, 4]]) {
  test(`a hit at ${row},${col} targets only adjacent on-board cells`, () => {
    const ai = createAI();
    registerResult(ai, row, col, { hit: true, sunk: false });
    const count = row === 4 ? 4 : 2;
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      const shot = nextShot(ai, () => { throw new Error('Should target before hunting'); });
      assert.ok(shot.row >= 0 && shot.row < 10 && shot.col >= 0 && shot.col < 10);
      assert.equal(Math.abs(shot.row - row) + Math.abs(shot.col - col), 1);
      const key = `${shot.row},${shot.col}`;
      assert.equal(seen.has(key), false);
      seen.add(key);
      registerResult(ai, shot.row, shot.col, { hit: false });
    }
    assert.equal(ai.queue.length, 0);
  });
}

for (const { label, hits, expected } of [
  { label: 'horizontal', hits: [[4, 4], [4, 5]], expected: ['4,3', '4,6'] },
  { label: 'vertical', hits: [[4, 4], [5, 4]], expected: ['3,4', '6,4'] },
]) {
  test(`aligned ${label} hits target both ends and discard perpendicular guesses`, () => {
    const ai = createAI();
    for (const [row, col] of hits) registerResult(ai, row, col, { hit: true, sunk: false });
    const targets = [];
    for (let i = 0; i < 2; i++) {
      const { row, col } = nextShot(ai, () => { throw new Error('Expected a line target'); });
      targets.push(`${row},${col}`);
      registerResult(ai, row, col, { hit: false });
    }
    assert.deepEqual(targets.sort(), expected.sort());
  });
}

test('sinking clears targeting memory but retains tried cells', () => {
  const ai = createAI();
  registerResult(ai, 4, 4, { hit: true, sunk: false });
  registerResult(ai, 4, 5, { hit: true, sunk: true });
  assert.deepEqual(ai.hits, []);
  assert.deepEqual(ai.queue, []);
  assert.deepEqual(ai.tried, new Set(['4,4', '4,5']));
  const shot = nextShot(ai, seededRandom(1));
  assert.equal((shot.row + shot.col) % 2, 0);
  assert.equal(ai.tried.has(`${shot.row},${shot.col}`), false);
});

test('repeat results do not add unresolved hits or target candidates', () => {
  const ai = createAI();
  registerResult(ai, 4, 4, { hit: true, sunk: false });
  const before = structuredClone(ai);
  registerResult(ai, 4, 4, { repeat: true });
  assert.deepEqual(ai, before);
});

test('AI sinks complete fleets using only shot feedback within 100 unique shots', () => {
  for (const seed of [1, 42, 2026, 123456789]) {
    const board = randomPlacement(createBoard(), seededRandom(seed));
    const ai = createAI();
    const rng = seededRandom(seed + 1);
    for (let turn = 0; turn < 100 && !allSunk(board); turn++) {
      const shot = nextShot(ai, rng);
      assert.ok(shot, `missing shot for seed ${seed} at turn ${turn}`);
      const { row, col } = shot;
      assert.ok(row >= 0 && row < 10 && col >= 0 && col < 10);
      const result = fireAt(board, row, col);
      assert.notEqual(result.repeat, true, `repeat for seed ${seed} at turn ${turn}`);
      registerResult(ai, row, col, result);
    }
    assert.equal(allSunk(board), true, `fleet survived for seed ${seed}`);
    assert.equal(ai.tried.size, board.shots.size);
  }
});
