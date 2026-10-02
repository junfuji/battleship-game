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
  clippedShipCells,
  fireAt,
  allSunk,
  remainingShips,
  randomPlacement,
} from './game.js';

import { createAI, nextShot, registerResult } from './ai.js';

const PHASE = { PLACEMENT: 'placement', PLAYER_TURN: 'player', AI_TURN: 'ai', OVER: 'over' };

let state;
let aiTimer;
let keyboardShotCell;

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
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.tabIndex = row === 0 && col === 0 ? 0 : -1;
      cell.dataset.row = row;
      cell.dataset.col = col;
      if (onCellClick) {
        cell.addEventListener('click', (event) => onCellClick(row, col, event.detail === 0));
      }
      cell.addEventListener('focus', () => {
        for (const other of grid.querySelectorAll('button.cell')) other.tabIndex = -1;
        cell.tabIndex = 0;
        if (onCellHover) onCellHover(row, col);
      });
      cell.addEventListener('keydown', (event) =>
        moveBoardFocus(event, container, row, col)
      );
      if (onCellHover) {
        cell.addEventListener('mouseenter', () => onCellHover(row, col));
        cell.addEventListener('mouseleave', () => onCellHover(null, null));
        cell.addEventListener('blur', () => onCellHover(null, null));
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

function moveBoardFocus(event, container, row, col) {
  const directions = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  for (let step = 1; step < BOARD_SIZE; step++) {
    const nextRow = (row + direction[0] * step + BOARD_SIZE) % BOARD_SIZE;
    const nextCol = (col + direction[1] * step + BOARD_SIZE) % BOARD_SIZE;
    const next = cellEl(container, nextRow, nextCol);
    if (!next.disabled) {
      next.focus();
      return;
    }
  }
}

function updateBoardTabStop(container) {
  const cells = [...container.querySelectorAll('button.cell')];
  const active =
    cells.find((cell) => !cell.disabled && cell.tabIndex === 0) ||
    cells.find((cell) => !cell.disabled);
  for (const cell of cells) cell.tabIndex = cell === active ? 0 : -1;
}

// ---- Rendering -------------------------------------------------------------

// Render the player's board: own ships visible, plus shots the AI took.
function renderPlayerBoard() {
  const container = el('player-board');
  const occupied = new Set();
  const sunkCells = new Set();
  for (const ship of state.playerBoard.ships) {
    for (const c of ship.cells) {
      occupied.add(cellKey(c.row, c.col));
      if (ship.hits.size === ship.length) sunkCells.add(cellKey(c.row, c.col));
    }
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
      if (sunkCells.has(key)) cell.classList.add('sunk');
      cell.disabled = state.phase !== PHASE.PLACEMENT || isFleetComplete(state.playerBoard);
      const description = sunkCells.has(key)
        ? 'sunk ship'
        : wasShot ? (isShip ? 'hit ship' : 'miss') : isShip ? 'your ship' : 'water';
      cell.setAttribute('aria-label', `${COLUMNS[col]}${row + 1}, ${description}`);
    }
  }
  updateBoardTabStop(container);

  // Placement preview overlay.
  if (state.phase === PHASE.PLACEMENT && state.preview && !isFleetComplete(state.playerBoard)) {
    const { length } = FLEET[state.placeIndex];
    // Render the on-board portion of the ship regardless of legality; an
    // out-of-bounds hover still shows its clipped cells as illegal (preview-bad).
    const cells = clippedShipCells(
      state.preview.row,
      state.preview.col,
      length,
      state.orientation
    );
    const legal = canPlaceShip(
      state.playerBoard,
      state.preview.row,
      state.preview.col,
      length,
      state.orientation
    );
    for (const c of cells) {
      const cell = cellEl(container, c.row, c.col);
      if (cell) cell.classList.add(legal ? 'preview-ok' : 'preview-bad');
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
      cell.disabled = state.phase !== PHASE.PLAYER_TURN || wasShot;
      const description = sunkCells.has(key)
        ? 'sunk ship'
        : wasShot ? (isShip ? 'hit' : 'miss') : 'untried';
      cell.setAttribute('aria-label', `${COLUMNS[col]}${row + 1}, ${description}`);
    }
  }
  updateBoardTabStop(container);
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
    const title = document.createElement('span');
    title.className = 'fleet-name';
    title.textContent = name;
    const segments = document.createElement('span');
    segments.className = 'fleet-segments';
    segments.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < length; i++) segments.appendChild(document.createElement('span'));
    const badge = document.createElement('span');
    badge.className = 'fleet-state';
    badge.textContent = isPlayer ? 'Ready' : 'Unknown';
    if (isPlayer && state.phase === PHASE.PLACEMENT && !placedNames.has(name)) {
      li.classList.add('pending');
      const next = name === FLEET[state.placeIndex]?.name;
      if (next) li.classList.add('next-ship');
      badge.textContent = next ? 'Up next' : 'Unplaced';
    } else if (!remaining.has(name) && placedNames.has(name)) {
      li.classList.add('sunk-ship');
      badge.textContent = 'Sunk';
    }
    li.setAttribute('aria-label', `${name}, ${length} cells, ${badge.textContent}`);
    li.append(title, segments, badge);
    ul.appendChild(li);
  }
}

function renderPlacementControls() {
  const setup = el('setup-controls');
  const show = state.phase === PHASE.PLACEMENT;
  setup.hidden = !show;
  if (show) {
    const next = isFleetComplete(state.playerBoard)
      ? 'All ships placed'
      : `Place your ${FLEET[state.placeIndex].name} · ${FLEET[state.placeIndex].length} cells`;
    el('placement-info').textContent = next;
    el('orientation-btn').textContent = `Rotate: ${state.orientation}`;
    el('start-btn').disabled = !isFleetComplete(state.playerBoard);
  }
}

function renderMission() {
  const placement = state.phase === PHASE.PLACEMENT;
  const over = state.phase === PHASE.OVER;
  const victory = over && allSunk(state.aiBoard);
  document.body.dataset.phase = state.phase;
  el('phase-label').textContent = placement ? 'Deployment' : over ? (victory ? 'Victory' : 'Defeat') : 'Engagement';
  el('turn-indicator').textContent = placement ? 'Awaiting orders' : over ? 'Mission complete' : state.phase === PHASE.AI_TURN ? 'AI targeting' : 'Your turn';
  const currentStep = placement ? 'step-deploy' : over ? 'step-result' : 'step-engage';
  for (const id of ['step-deploy', 'step-engage', 'step-result']) {
    el(id).removeAttribute('aria-current');
    el(id).classList.toggle('complete',
      (id === 'step-deploy' && !placement) || (id === 'step-engage' && over)
    );
    if (id === currentStep) el(id).setAttribute('aria-current', 'step');
  }
  el('result-label').textContent = over && !victory ? 'Defeat' : 'Victory';
  el('player-count').textContent = placement
    ? `${state.playerBoard.ships.length} / ${FLEET.length} deployed`
    : `${remainingShips(state.playerBoard).length} / ${FLEET.length} afloat`;
  el('ai-count').textContent = `${placement ? FLEET.length : remainingShips(state.aiBoard).length} / ${FLEET.length} afloat`;
  const shots = state.aiBoard.shots.size;
  const hits = state.aiBoard.ships.reduce((sum, ship) => sum + ship.hits.size, 0);
  el('shot-summary').textContent = shots ? `${shots} shots · ${hits} hits` : 'No shots fired';
  el('player-hint').textContent = placement
    ? isFleetComplete(state.playerBoard) ? 'Fleet deployed. Start the game when you are ready.' : 'Click a cell to place your ship. Rotate to change direction.'
    : 'Your fleet is visible here. Watch for incoming enemy fire.';
  el('ai-hint').textContent = placement ? 'Enemy positions are concealed. Deploy your fleet to begin.'
    : over ? 'Mission complete. Start a new game to sail again.'
    : state.phase === PHASE.AI_TURN ? 'Hold position. The enemy is choosing a target.'
    : 'Choose an untried cell to fire. Every shot counts.';
}

function render() {
  renderPlayerBoard();
  renderAIBoard();
  renderFleetLists();
  renderPlacementControls();
  renderMission();
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
  state.preview = null;
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

function onAICellClick(row, col, fromKeyboard) {
  if (state.phase !== PHASE.PLAYER_TURN) return;

  const result = fireAt(state.aiBoard, row, col);
  if (result.repeat) {
    setStatus('You already fired there — pick another cell.');
    return;
  }
  keyboardShotCell = fromKeyboard ? cellEl(el('ai-board'), row, col) : null;

  if (result.hit && result.sunk) {
    setStatus(`Hit! You sank the enemy ${result.shipName}.`);
  } else if (result.hit) {
    setStatus('Hit!');
  } else {
    setStatus('Miss.');
  }
  if (allSunk(state.aiBoard)) {
    keyboardShotCell = null;
    state.phase = PHASE.OVER;
    setStatus('Victory! You sank the entire enemy fleet.');
    render();
    return;
  }

  state.phase = PHASE.AI_TURN;
  render();
  // Small delay so the player sees their result before the AI responds.
  aiTimer = setTimeout(aiTurn, 600);
}

function aiTurn() {
  aiTimer = null;
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
  if (allSunk(state.playerBoard)) {
    keyboardShotCell = null;
    state.phase = PHASE.OVER;
    setStatus('Defeat — the AI sank your entire fleet.');
    render();
    return;
  }

  state.phase = PHASE.PLAYER_TURN;
  render();
  if (keyboardShotCell &&
      (document.activeElement === document.body || document.activeElement === keyboardShotCell)) {
    const next = [...el('ai-board').querySelectorAll('button.cell')]
      .find((cell) => cell.tabIndex === 0);
    if (next) next.focus();
  }
  keyboardShotCell = null;
}

// ---- Wiring ----------------------------------------------------------------

function newGame() {
  clearTimeout(aiTimer);
  aiTimer = null;
  keyboardShotCell = null;
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
