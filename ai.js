// ai.js — Battleship AI opponent. Pure logic, no DOM.
// The AI only knows its own shot results; it never reads the player's ships.

import { BOARD_SIZE, cellKey, inBounds } from './game.js';

// Build the AI's memory. It tracks:
//  - tried: cells already fired at ("r,c" keys)
//  - queue: prioritized target cells (from adjacency / line extension)
//  - hits:  unresolved hits belonging to the ship currently being hunted
export function createAI() {
  return {
    tried: new Set(),
    queue: [],
    hits: [],
  };
}

const ORTHOGONAL = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function tried(ai, row, col) {
  return ai.tried.has(cellKey(row, col));
}

function queued(ai, row, col) {
  return ai.queue.some((c) => c.row === row && c.col === col);
}

// Add an untried, on-board, not-already-queued cell to the target queue.
function enqueue(ai, row, col) {
  if (!inBounds(row, col)) return;
  if (tried(ai, row, col) || queued(ai, row, col)) return;
  ai.queue.push({ row, col });
}

// Hunt mode: pick a random untried cell on the parity pattern
// ((row+col) % 2 === 0). The smallest ship is length 2, so every ship must
// cover at least one such cell — halving the search space.
function pickHuntCell(ai, rng) {
  const candidates = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 !== 0) continue;
      if (!tried(ai, row, col)) candidates.push({ row, col });
    }
  }
  // Fallback: parity cells exhausted, fire at any remaining untried cell.
  if (candidates.length === 0) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!tried(ai, row, col)) candidates.push({ row, col });
      }
    }
  }
  return candidates[Math.floor(rng() * candidates.length)];
}

// Decide the next cell to fire at. Consumes cells from the target queue first
// (skipping any that became tried), otherwise falls back to hunt mode.
export function nextShot(ai, rng = Math.random) {
  while (ai.queue.length > 0) {
    const cell = ai.queue.shift();
    if (!tried(ai, cell.row, cell.col)) return cell;
  }
  return pickHuntCell(ai, rng);
}

// Once we have two or more hits, they lie on a line. Infer the orientation and
// queue the untried cells just beyond each end, ignoring perpendicular guesses.
function extendAlongLine(ai) {
  const sameRow = ai.hits.every((h) => h.row === ai.hits[0].row);
  const sameCol = ai.hits.every((h) => h.col === ai.hits[0].col);

  if (sameRow) {
    const row = ai.hits[0].row;
    const cols = ai.hits.map((h) => h.col);
    enqueue(ai, row, Math.min(...cols) - 1);
    enqueue(ai, row, Math.max(...cols) + 1);
    // Drop any perpendicular candidates left over from single-hit adjacency.
    ai.queue = ai.queue.filter((c) => c.row === row);
  } else if (sameCol) {
    const col = ai.hits[0].col;
    const rows = ai.hits.map((h) => h.row);
    enqueue(ai, Math.min(...rows) - 1, col);
    enqueue(ai, Math.max(...rows) + 1, col);
    ai.queue = ai.queue.filter((c) => c.col === col);
  }
}

// Feed the result of the AI's last shot back into its memory so it can plan.
// result is the object returned by game.fireAt: { hit, sunk, row, col, ... }.
export function registerResult(ai, row, col, result) {
  ai.tried.add(cellKey(row, col));

  if (result.repeat) return;

  if (result.hit) {
    if (result.sunk) {
      // Ship destroyed: forget this hunt and go back to hunt mode.
      ai.hits = [];
      ai.queue = [];
      return;
    }
    ai.hits.push({ row, col });
    if (ai.hits.length >= 2) {
      extendAlongLine(ai);
    } else {
      // First hit: queue the four orthogonal neighbours.
      for (const { dr, dc } of ORTHOGONAL) enqueue(ai, row + dr, col + dc);
    }
  }
}
