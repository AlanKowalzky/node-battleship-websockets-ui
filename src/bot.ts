import { Ship, PlayerBoard, Shot } from './gameManager.js';

const BOARD_SIZE = 10;

interface ShipInfo {
  type: Ship['type'];
  length: number;
}

// Helper function to get the bounding box of a ship
function getShipBoundingBox(ship: Ship): { xMin: number; yMin: number; xMax: number; yMax: number } {
  if (ship.direction) { // True: Vertical (length along Y axis)
    return {
      xMin: ship.position.x,
      yMin: ship.position.y,
      xMax: ship.position.x, // Stays in the same column
      yMax: ship.position.y + ship.length - 1,
    };
  } else { // False: Horizontal (length along X axis)
    return {
      xMin: ship.position.x,
      yMin: ship.position.y,
      xMax: ship.position.x + ship.length - 1,
      yMax: ship.position.y, // Stays in the same row
    };
  }
}

function isPlacementValid(newShip: Ship, existingShips: Ship[], boardSize: number): boolean {
  // 1. Boundary checks for newShip
  if (newShip.position.x < 0 || newShip.position.y < 0) {
    return false;
  }
  if (newShip.direction) { // True: Vertical
    if (newShip.position.x >= boardSize || newShip.position.y + newShip.length > boardSize) {
      return false;
    }
  } else { // False: Horizontal
    if (newShip.position.x + newShip.length > boardSize || newShip.position.y >= boardSize) {
      return false;
    }
  }

  // 2. Check for collision or touching with existing ships
  const newShipBB = getShipBoundingBox(newShip);

  for (const existingShip of existingShips) {
    const existingShipBB = getShipBoundingBox(existingShip);

    const tooClose =
      existingShipBB.xMin <= newShipBB.xMax + 1 &&
      existingShipBB.xMax >= newShipBB.xMin - 1 &&
      existingShipBB.yMin <= newShipBB.yMax + 1 &&
      existingShipBB.yMax >= newShipBB.yMin - 1;

    if (tooClose) {
      return false; // Ships are too close or overlapping
    }
  }
  return true; // Placement is valid
}

export function placeBotShips(): Ship[] {
  const shipsToPlace = [
    { type: 'huge', length: 4 },
    { type: 'large', length: 3 },
    { type: 'large', length: 3 },
    { type: 'medium', length: 2 },
    { type: 'medium', length: 2 },
    { type: 'medium', length: 2 },
    { type: 'small', length: 1 },
    { type: 'small', length: 1 },
    { type: 'small', length: 1 },
    { type: 'small', length: 1 },
  ];

  const placedShips: Ship[] = [];

  for (const shipInfo of shipsToPlace as ShipInfo[]) {
    let placed = false;
    let attempts = 0;
    // Zwiększono liczbę prób, aby dać więcej szans na znalezienie miejsca
    // przy bardziej restrykcyjnych zasadach (statki nie mogą się stykać)
    while (!placed && attempts < 2000) {
      const newShip: Ship = {
        position: {
          x: Math.floor(Math.random() * BOARD_SIZE),
          y: Math.floor(Math.random() * BOARD_SIZE),
        },
        direction: Math.random() < 0.5,
        length: shipInfo.length,
        type: shipInfo.type,
        hits: Array(shipInfo.length).fill(false),
      };
      if (isPlacementValid(newShip, placedShips, BOARD_SIZE)) {
        placedShips.push(newShip);
        placed = true;
      }
      attempts++;
    }
    if (!placed) {
      console.error(
        `[Bot] Failed to place ship of length ${shipInfo.length} after ${attempts} attempts.`
      );
    }
  }

  console.log(`[Bot] Placed ${placedShips.length} ships.`);
  return placedShips;
}

export function makeBotShot(
  opponentShotsReceived: Shot[]
): { x: number; y: number } | undefined {
  const availableCoordinates: { x: number; y: number }[] = [];
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      if (!opponentShotsReceived.some((shot) => shot.x === x && shot.y === y)) {
        availableCoordinates.push({ x, y });
      }
    }
  }

  if (availableCoordinates.length === 0) {
    console.warn('[Bot] No available cells to shoot at. Game should be over.');
    return undefined;
  }

  const randomIndex = Math.floor(Math.random() * availableCoordinates.length);
  return availableCoordinates[randomIndex];
}
