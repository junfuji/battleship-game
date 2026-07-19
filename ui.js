// ui.js — all DOM rendering and user interaction. Wires game.js + ai.js together.

import {
  BOARD_SIZE,
  COLUMNS,
  FLEET,
  ORIENTATIONS,
  cellKey,
  createBoard,
  canPlaceShip,
  placeShip,
  clearShips,
  isFleetComplete,
  shipCells,
  fireAt,
  allSunk,
  remainingShips,
  randomPlacement,
} from './game.js';

import { createAI, nextShot, registerResult } from './ai.js';

const PHASE = { PLACEMENT: 'placement', PLAYER_TURN: 'player', AI_TURN: 'ai', OVER: 'over' };

let state;

function newState() {
  return {
    phase: PHASE.PLACEMENT,
    playerBoard: createBoard(),
    aiBoard: createBoard(),
    ai: createAI(),
    placeIndex: 0, // which FLEET ship we're placing
    orientation: ORIENTATIONS.HORIZONTAL,
    preview: null, // {row, col} being hovered during placement
  };
}

// ---- DOM helpers -----------------------------------------------------------

const el = (id) => document.getElementById(id);

function setStatus(msg) {
  el('status').textContent = msg;
}

// Build a fresh 11x11 grid (labels + 10x10 cells) inside a container.
function buildGrid(container, onCellClick, onCellHover) {
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'grid';

  // Top-left corner spacer.
  grid.appendChild(labelCell(''));
  // Column headers A-J.
  for (const letter of COLUMNS) grid.appendChild(labelCell(letter));

  for (let row = 0; row < BOARD_SIZE; row++) {
    grid.appendChild(labelCell(String(row + 1))); // row number 1-10
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      if (onCellClick) cell.addEventListener('click', () => onCellClick(row, col));
      if (onCellHover) {
        cell.addEventListener('mouseenter', () => onCellHover(row, col));
        cell.addEventListener('mouseleave', () => onCellHover(null, null));
      }
      grid.appendChild(cell);
    }
  }
  container.appendChild(grid);
}

function labelCell(text) {
  const d = document.createElement('div');
  d.className = 'cell label';
  d.textContent = text;
  return d;
}

function cellEl(container, row, col) {
  return container.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

// ---- Rendering -------------------------------------------------------------

// Render the player's board: own ships visible, plus shots the AI took.
function renderPlayerBoard() {
  const container = el('player-board');
  const occupied = new Set();
  for (const ship of state.playerBoard.ships) {
    for (const c of ship.cells) occupied.add(cellKey(c.row, c.col));
  }

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = cellEl(container, row, col);
      cell.className = 'cell';
      const key = cellKey(row, col);
      const isShip = occupied.has(key);
      const wasShot = state.playerBoard.shots.has(key);

      if (isShip) cell.classList.add('ship');
      if (wasShot && isShip) cell.classList.add('hit');
      if (wasShot && !isShip) cell.classList.add('miss');
    }
  }

  // Placement preview overlay.
  if (state.phase === PHASE.PLACEMENT && state.preview) {
    const { length } = FLEET[state.placeIndex];
    const cells = shipCells(state.preview.row, state.preview.col, length, state.orientation);
    const legal = canPlaceShip(
      state.playerBoard,
      state.preview.row,
      state.preview.col,
      length,
      state.orientation
    );
    if (cells) {
      for (const c of cells) {
        const cell = cellEl(container, c.row, c.col);
        if (cell) cell.classList.add(legal ? 'preview-ok' : 'preview-bad');
      }
    }
  }
}

// Render the AI's board: ships hidden unless sunk; show hits/misses.
function renderAIBoard() {
  const container = el('ai-board');
  // Cells belonging to sunk ships (revealed).
  const sunkCells = new Set();
  const shipCellSet = new Set();
  for (const ship of state.aiBoard.ships) {
    const sunk = ship.hits.size === ship.length;
    for (const c of ship.cells) {
      shipCellSet.add(cellKey(c.row, c.col));
      if (sunk) sunkCells.add(cellKey(c.row, c.col));
    }
  }

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = cellEl(container, row, col);
      cell.className = 'cell';
      const key = cellKey(row, col);
      const wasShot = state.aiBoard.shots.has(key);
      const isShip = shipCellSet.has(key);

      if (sunkCells.has(key)) {
        cell.classList.add('sunk');
      } else if (wasShot && isShip) {
        cell.classList.add('hit');
      } else if (wasShot) {
        cell.classList.add('miss');
      }
    }
  }
}

function renderFleetLists() {
  renderFleetList('player-fleet', state.playerBoard, true);
  renderFleetList('ai-fleet', state.aiBoard, false);
}

// List each ship with a struck-through style when sunk. During placement the
// player's ships that haven't been placed yet are shown as pending.
function renderFleetList(id, board, isPlayer) {
  const ul = el(id);
  ul.innerHTML = '';
  const remaining = new Set(remainingShips(board));
  const placedNames = new Set(board.ships.map((s) => s.name));

  for (const { name, length } of FLEET) {
    const li = document.createElement('li');
    li.textContent = `${name} (${length})`;
    if (isPlayer && state.phase === PHASE.PLACEMENT && !placedNames.has(name)) {
      li.classList.add('pending');
    } else if (!remaining.has(name) && placedNames.has(name)) {
      li.classList.add('sunk-ship');
    }
    ul.appendChild(li);
  }
}

function renderPlacementControls() {
  const setup = el('setup-controls');
  const show = state.phase === PHASE.PLACEMENT;
  setup.style.display = show ? 'flex' : 'none';
  if (show) {
    const next = isFleetComplete(state.playerBoard)
      ? 'All ships placed'
      : `Placing: ${FLEET[state.placeIndex].name} (${FLEET[state.placeIndex].length})`;
    el('placement-info').textContent = next;
    el('orientation-btn').textContent = `Rotate: ${state.orientation}`;
    el('start-btn').disabled = !isFleetComplete(state.playerBoard);
  }
}

function render() {
  renderPlayerBoard();
  renderAIBoard();
  renderFleetLists();
  renderPlacementControls();
}

// ---- Placement phase -------------------------------------------------------

function onPlayerCellClick(row, col) {
  if (state.phase !== PHASE.PLACEMENT) return;
  if (isFleetComplete(state.playerBoard)) return;

  const { name, length } = FLEET[state.placeIndex];
  if (!canPlaceShip(state.playerBoard, row, col, length, state.orientation)) {
    setStatus('Illegal placement — try another spot.');
    return;
  }
  placeShip(state.playerBoard, name, length, row, col, state.orientation);
  state.placeIndex++;
  state.preview = null;
  if (isFleetComplete(state.playerBoard)) {
    setStatus('Fleet ready. Click "Start game" to play.');
  } else {
    setStatus(`Place your ${FLEET[state.placeIndex].name}.`);
  }
  render();
}

function onPlayerCellHover(row, col) {
  if (state.phase !== PHASE.PLACEMENT || isFleetComplete(state.playerBoard)) return;
  state.preview = row === null ? null : { row, col };
  renderPlayerBoard();
}

function rotate() {
  state.orientation =
    state.orientation === ORIENTATIONS.HORIZONTAL
      ? ORIENTATIONS.VERTICAL
      : ORIENTATIONS.HORIZONTAL;
  render();
}

function doRandomPlacement() {
  randomPlacement(state.playerBoard);
  state.placeIndex = FLEET.length;
  setStatus('Random fleet placed. Click "Start game" to play.');
  render();
}

function resetPlacement() {
  clearShips(state.playerBoard);
  state.placeIndex = 0;
  state.preview = null;
  setStatus('Placement reset. Place your Carrier.');
  render();
}

function startGame() {
  if (!isFleetComplete(state.playerBoard)) return;
  randomPlacement(state.aiBoard); // AI places its own fleet.
  state.phase = PHASE.PLAYER_TURN;
  setStatus('Your turn — fire at the enemy waters.');
  render();
}

// ---- Combat phase ----------------------------------------------------------

function onAICellClick(row, col) {
  if (state.phase !== PHASE.PLAYER_TURN) return;

  const result = fireAt(state.aiBoard, row, col);
  if (result.repeat) {
    setStatus('You already fired there — pick another cell.');
    return;
  }

  if (result.hit && result.sunk) {
    setStatus(`Hit! You sank the enemy ${result.shipName}.`);
  } else if (result.hit) {
    setStatus('Hit!');
  } else {
    setStatus('Miss.');
  }
  render();

  if (allSunk(state.aiBoard)) {
    state.phase = PHASE.OVER;
    setStatus('Victory! You sank the entire enemy fleet.');
    render();
    return;
  }

  state.phase = PHASE.AI_TURN;
  // Small delay so the player sees their result before the AI responds.
  setTimeout(aiTurn, 600);
}

function aiTurn() {
  if (state.phase !== PHASE.AI_TURN) return;

  const shot = nextShot(state.ai);
  const result = fireAt(state.playerBoard, shot.row, shot.col);
  registerResult(state.ai, shot.row, shot.col, result);

  const coord = `${COLUMNS[shot.col]}${shot.row + 1}`;
  if (result.hit && result.sunk) {
    setStatus(`AI fired at ${coord} — sank your ${result.shipName}!`);
  } else if (result.hit) {
    setStatus(`AI fired at ${coord} — hit your ship.`);
  } else {
    setStatus(`AI fired at ${coord} — miss. Your turn.`);
  }
  render();

  if (allSunk(state.playerBoard)) {
    state.phase = PHASE.OVER;
    setStatus('Defeat — the AI sank your entire fleet.');
    render();
    return;
  }

  state.phase = PHASE.PLAYER_TURN;
}

// ---- Wiring ----------------------------------------------------------------

function newGame() {
  state = newState();
  buildGrid(el('player-board'), onPlayerCellClick, onPlayerCellHover);
  buildGrid(el('ai-board'), onAICellClick, null);
  setStatus('Place your Carrier (5). Use Rotate to change orientation.');
  render();
}

export function init() {
  el('orientation-btn').addEventListener('click', rotate);
  el('random-btn').addEventListener('click', doRandomPlacement);
  el('reset-btn').addEventListener('click', resetPlacement);
  el('start-btn').addEventListener('click', startGame);
  el('new-game-btn').addEventListener('click', newGame);
  newGame();
}

// Expose state for console debugging.
export function getState() {
  return state;
}
