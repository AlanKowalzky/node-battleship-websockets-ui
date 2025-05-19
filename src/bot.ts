import { Ship, PlayerBoard, Shot } from './gameManager.js'; // Importujemy potrzebne typy

const BOARD_SIZE = 10;

// Definiujemy strukturę obiektów w tablicy shipsToPlace, używając typu Ship['type']
interface ShipInfo { type: Ship['type']; length: number; }

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
    // Sprawdź, czy statek mieści się na planszy
    if (ship.direction) { // Poziomo
      if (ship.position.x + ship.length > BOARD_SIZE) return false;
    } else { // Pionowo
      if (ship.position.y + ship.length > BOARD_SIZE) return false;
    }

    // Sprawdź kolizje z istniejącymi statkami (wliczając otoczenie 1 pola)
    for (const existingShip of existingShips) {
      for (let i = -1; i <= ship.length; i++) {
        for (let j = -1; j <= 1; j++) {
          const newShipX = ship.position.x + (ship.direction ? i : j);
          const newShipY = ship.position.y + (ship.direction ? j : i);

          for (let ei = 0; ei < existingShip.length; ei++) {
            const existingShipX = existingShip.position.x + (existingShip.direction ? ei : 0);
            const existingShipY = existingShip.position.y + (existingShip.direction ? 0 : ei);

            if (newShipX === existingShipX && newShipY === existingShipY) {
              return false; // Kolizja
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
    while (!placed && attempts < 1000) { // Ogranicz liczbę prób
      const newShip: Ship = {
        position: { x: Math.floor(Math.random() * BOARD_SIZE), y: Math.floor(Math.random() * BOARD_SIZE) },
        direction: Math.random() < 0.5, // true (poziomo) lub false (pionowo)
        length: shipInfo.length,
        type: shipInfo.type,
      };
      if (isPlacementValid(newShip, placedShips)) {
        placedShips.push(newShip);
        placed = true;
      }
      attempts++;
    }
    if (!placed) {
        console.error(`[Bot] Failed to place ship of length ${shipInfo.length} after ${attempts} attempts.`);
        // W przypadku niepowodzenia, można zresetować i spróbować od nowa,
        // lub zwrócić błąd. Na razie logujemy.
    }
  }

  console.log(`[Bot] Placed ${placedShips.length} ships.`);
  return placedShips;
}

/**
 * Wykonuje losowy strzał w nieatakowane pole na planszy przeciwnika.
 * @param opponentShotsReceived - Tablica strzałów otrzymanych przez przeciwnika (widok bota na planszę przeciwnika).
 * @returns Koordynaty strzału { x, y }.
 */
export function makeBotShot(opponentShotsReceived: Shot[]): { x: number; y: number } | undefined {
  const availableCoordinates: { x: number; y: number }[] = [];
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      // Sprawdź, czy pole nie było już strzelane
      if (!opponentShotsReceived.some(shot => shot.x === x && shot.y === y)) {
        availableCoordinates.push({ x, y });
      }
    }
  }

  if (availableCoordinates.length === 0) {
    // Wszystkie pola zostały ostrzelane - gra powinna być zakończona
    console.warn("[Bot] No available cells to shoot at. Game should be over.");
    return undefined; // Brak dostępnych pól
  }

  // Wybierz losowe, nieatakowane pole
  const randomIndex = Math.floor(Math.random() * availableCoordinates.length);
  return availableCoordinates[randomIndex];
}

// TODO: Implementacja bardziej zaawansowanej logiki strzelania (np. wokół trafionych pól)
// function makeSmartBotShot(opponentShotsReceived: Shot[]): { x: number; y: number } | undefined {
//   // ... logika ...
// }