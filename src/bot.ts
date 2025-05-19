import { Ship, PlayerBoard, Shot } from './gameManager.js';

const BOARD_SIZE = 10;

interface ShipInfo {
  type: Ship['type'];
  length: number;
}

/**
 * Generuje losowe, poprawne rozmieszczenie statków dla bota.
 * Implementuje prostą strategię losowego umieszczania statków,
 * sprawdzając kolizje.
 */
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

  const isPlacementValid = (ship: Ship, existingShips: Ship[]): boolean => {
    if (ship.direction) {
      if (ship.position.x + ship.length > BOARD_SIZE) return false;
    } else {
      if (ship.position.y + ship.length > BOARD_SIZE) return false;
    }

    for (const existingShip of existingShips) {
      for (let i = -1; i <= ship.length; i++) {
        for (let j = -1; j <= 1; j++) {
          const newShipX = ship.position.x + (ship.direction ? i : j);
          const newShipY = ship.position.y + (ship.direction ? j : i);

          for (let ei = 0; ei < existingShip.length; ei++) {
            const existingShipX =
              existingShip.position.x + (existingShip.direction ? ei : 0);
            const existingShipY =
              existingShip.position.y + (existingShip.direction ? 0 : ei);

            if (newShipX === existingShipX && newShipY === existingShipY) {
              return false;
            }
          }
        }
      }
    }
    return true;
  };

  for (const shipInfo of shipsToPlace as ShipInfo[]) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
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
      if (isPlacementValid(newShip, placedShips)) {
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
