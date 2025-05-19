import WebSocket from 'ws';
import { RoomUser } from './roomManager.js'; // Załóżmy, że RoomUser jest eksportowany

export interface Ship {
  position: {
    x: number;
    y: number;
  };
  direction: boolean; // true for horizontal, false for vertical
  length: number;
  type: 'small' | 'medium' | 'large' | 'huge';
}

export interface Shot {
  x: number;
  y: number;
  result: 'miss' | 'shot' | 'killed'; // 'killed' indicates the shot that sunk the ship
  // shipType?: Ship['type']; // Optional: If 'killed', what type of ship was it? Client can deduce from ship object.
}

export interface PlayerBoard {
  ships: Ship[];
  // Można dodać tutaj planszę strzałów, jeśli chcemy ją przechowywać po stronie serwera
  // shots: { x: number; y: number; result: 'miss' | 'hit' | 'sunk' }[];
  shotsReceived: Shot[]; // Shots made by the opponent on this player's board
}

export interface Game {
  gameId: number;
  players: [
    { playerId: number; playerName: string; board?: PlayerBoard; ws?: WebSocket }, // Gracz 1
    { playerId: number; playerName: string; board?: PlayerBoard; ws?: WebSocket }  // Gracz 2
  ];
  currentPlayerIndex: number; // 0 dla gracza 1, 1 dla gracza 2
  status: 'pending_ships' | 'playing' | 'finished';
  winner?: number; // playerId of the winner
}

const activeGames = new Map<number, Game>();

export function createNewGame(gameId: number, player1: RoomUser, player2: RoomUser): Game {
  if (activeGames.has(gameId)) {
    // To nie powinno się zdarzyć, jeśli gameId jest unikalne
    console.warn(`[GameManager] Game with ID ${gameId} already exists. Overwriting.`);
  }

  const newGame: Game = {
    gameId,
    players: [
      { playerId: player1.index, playerName: player1.name, ws: player1.ws, board: { ships: [], shotsReceived: [] } },
      { playerId: player2.index, playerName: player2.name, ws: player2.ws, board: { ships: [], shotsReceived: [] } },
    ],
    currentPlayerIndex: Math.random() < 0.5 ? 0 : 1, // Losowo wybierz, kto zaczyna
    status: 'pending_ships',
  };

  activeGames.set(gameId, newGame);
  console.log(`[GameManager] Created new game: ${gameId} with players ${player1.name} and ${player2.name}. Player ${newGame.players[newGame.currentPlayerIndex].playerName} starts.`);
  return newGame;
}

export function addShipsToGame(gameId: number, playerId: number, ships: Ship[]): { game?: Game; error?: string } {
  const game = activeGames.get(gameId);
  if (!game) {
    return { error: 'Game not found' };
  }

  const playerIndex = game.players.findIndex(p => p.playerId === playerId);
  if (playerIndex === -1) {
    return { error: 'Player not found in this game' };
  }

  if (game.players[playerIndex].board) {
    return { error: 'Player has already submitted ships for this game' };
  }

  game.players[playerIndex].board = { ships, shotsReceived: [] }; // Initialize shotsReceived
  console.log(`[GameManager] Ships added for player ${game.players[playerIndex].playerName} (ID: ${playerId}) in game ${gameId}`);

  // Sprawdź, czy obaj gracze dodali statki
  if (game.players[0].board?.ships.length && game.players[1].board?.ships.length) {
    game.status = 'playing';
    console.log(`[GameManager] Both players have submitted ships for game ${gameId}. Game status changed to 'playing'.`);
  }

  return { game };
}

function getShipAtCoordinates(coordinates: { x: number; y: number }, ships: Ship[]): Ship | undefined {
  for (const ship of ships) {
    for (let i = 0; i < ship.length; i++) {
      const shipX = ship.position.x + (ship.direction ? i : 0);
      const shipY = ship.position.y + (ship.direction ? 0 : i);
      if (shipX === coordinates.x && shipY === coordinates.y) {
        return ship;
      }
    }
  }
  return undefined;
}

function isShipKilled(ship: Ship, shotsReceived: Shot[]): boolean {
  let hitCount = 0;
  for (let i = 0; i < ship.length; i++) {
    const shipX = ship.position.x + (ship.direction ? i : 0);
    const shipY = ship.position.y + (ship.direction ? 0 : i);
    if (shotsReceived.some(shot => shot.x === shipX && shot.y === shipY && (shot.result === 'shot' || shot.result === 'killed'))) {
      hitCount++;
    }
  }
  return hitCount === ship.length;
}

function markSurroundingCellsAsMiss(
  board: PlayerBoard,
  ship: Ship
): void {
  const boardSize = 10; // Załóżmy rozmiar planszy 10x10
  for (let i = 0; i < ship.length; i++) {
    // Kierunek statku: true dla poziomego, false dla pionowego w oryginalnym kodzie.
    // W mojej implementacji: direction: true dla pionowego, false dla poziomego.
    // Dostosujmy do oryginalnej logiki, gdzie direction: true to poziomy.
    const shipX = ship.position.x + (ship.direction ? i : 0); 
    const shipY = ship.position.y + (ship.direction ? 0 : i); 

    // Sprawdź 8 sąsiadów + samą komórkę (choć sama komórka już jest trafiona)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const checkX = shipX + dx;
        const checkY = shipY + dy;

        // Sprawdź granice planszy
        if (checkX >= 0 && checkX < boardSize && checkY >= 0 && checkY < boardSize) {
          // Sprawdź, czy pole nie było już strzelane
          const alreadyShot = board.shotsReceived.some(
            (s) => s.x === checkX && s.y === checkY
          );
          if (!alreadyShot) {
            board.shotsReceived.push({ x: checkX, y: checkY, result: 'miss' });
            console.log(`[GameManager] Marked surrounding cell (${checkX},${checkY}) as miss for ship type ${ship.type}`);
          }
        }
      }
    }
  }
}

function checkWinCondition(defendingPlayerBoard: PlayerBoard): boolean {
  if (!defendingPlayerBoard || !defendingPlayerBoard.ships || !defendingPlayerBoard.shotsReceived) return false;
  return defendingPlayerBoard.ships.every(ship => isShipKilled(ship, defendingPlayerBoard.shotsReceived));
}

export interface AttackResultDetails {
  gameId: number;
  attackingPlayerId: number;
  coordinates: { x: number; y: number };
  result: 'miss' | 'shot' | 'killed';
  shipKilled?: Ship;
  turnChanged: boolean;
  nextPlayerId: number;
  winner?: number;
  error?: string;
}

export function handleAttack(
  gameId: number,
  attackingPlayerId: number,
  coordinates: { x: number; y: number }
): AttackResultDetails {
  const game = activeGames.get(gameId);
  if (!game) return { error: 'Game not found' } as AttackResultDetails;
  if (game.status !== 'playing') return { error: 'Game is not active' } as AttackResultDetails;

  const attackingPlayerIndex = game.players.findIndex(p => p.playerId === attackingPlayerId);
  if (attackingPlayerIndex === -1) return { error: 'Attacking player not found in this game' } as AttackResultDetails;
  if (game.currentPlayerIndex !== attackingPlayerIndex) return { error: 'Not your turn' } as AttackResultDetails;

  if (coordinates.x < 0 || coordinates.x > 9 || coordinates.y < 0 || coordinates.y > 9) {
    return { error: 'Invalid coordinates' } as AttackResultDetails;
  }

  const defendingPlayerIndex = 1 - attackingPlayerIndex;
  const defendingPlayer = game.players[defendingPlayerIndex];

  if (!defendingPlayer.board) return { error: 'Defending player board not set up' } as AttackResultDetails;

  if (defendingPlayer.board.shotsReceived.some(shot => shot.x === coordinates.x && shot.y === coordinates.y)) {
    return { error: 'Cell already shot' } as AttackResultDetails;
  }

  let attackResult: 'miss' | 'shot' | 'killed' = 'miss';
  let shipKilled: Ship | undefined = undefined;
  let turnChanged = true;

  const hitShip = getShipAtCoordinates(coordinates, defendingPlayer.board.ships);

  if (hitShip) {
    attackResult = 'shot';
    turnChanged = false; // Player continues turn on hit

    // Record the shot
    defendingPlayer.board.shotsReceived.push({ x: coordinates.x, y: coordinates.y, result: 'shot' });

    if (isShipKilled(hitShip, defendingPlayer.board.shotsReceived)) {
      attackResult = 'killed';
      shipKilled = hitShip;
      // Update all shots for this ship to 'killed' status
      for (let i = 0; i < hitShip.length; i++) {
        const shipX = hitShip.position.x + (hitShip.direction ? i : 0);
        const shipY = hitShip.position.y + (hitShip.direction ? 0 : i);
        const shotIndex = defendingPlayer.board.shotsReceived.findIndex(s => s.x === shipX && s.y === shipY);
        if (shotIndex !== -1) {
          defendingPlayer.board.shotsReceived[shotIndex].result = 'killed';
        }
      }
      console.log(`[GameManager] Ship killed: ${hitShip.type} in game ${gameId}`);
      // Oznacz komórki wokół zatopionego statku jako 'miss' na planszy broniącego się
      markSurroundingCellsAsMiss(defendingPlayer.board, hitShip);
    }
  } else {
    attackResult = 'miss';
    defendingPlayer.board.shotsReceived.push({ x: coordinates.x, y: coordinates.y, result: 'miss' });
  }

  let winner: number | undefined = undefined;
  if (attackResult === 'killed' || attackResult === 'shot') { // Check win only if it was a hit
    if (checkWinCondition(defendingPlayer.board)) {
      winner = attackingPlayerId;
      game.status = 'finished';
      game.winner = winner;
      console.log(`[GameManager] Game ${gameId} finished. Winner: ${attackingPlayerId}`);
    }
  }

  if (turnChanged && game.status === 'playing') {
    game.currentPlayerIndex = defendingPlayerIndex;
  }
  const nextPlayerId = game.players[game.currentPlayerIndex].playerId;

  console.log(`[GameManager] Attack in game ${gameId} by ${attackingPlayerId} at (${coordinates.x},${coordinates.y}): ${attackResult}. Turn changed: ${turnChanged}. Next player: ${nextPlayerId}`);
  return { gameId, attackingPlayerId, coordinates, result: attackResult, shipKilled, turnChanged, nextPlayerId, winner };
}

export function handleRandomAttack(
  gameId: number,
  attackingPlayerId: number
): AttackResultDetails {
  const game = activeGames.get(gameId);
  if (!game) return { error: 'Game not found' } as AttackResultDetails;
  // Podstawowe walidacje (tura, status gry) są w handleAttack, ale możemy je powtórzyć lub uprościć
  if (game.status !== 'playing') return { error: 'Game is not active' } as AttackResultDetails;
  const attackingPlayerIndex = game.players.findIndex(p => p.playerId === attackingPlayerId);
  if (attackingPlayerIndex === -1) return { error: 'Attacking player not found' } as AttackResultDetails;
  if (game.currentPlayerIndex !== attackingPlayerIndex) return { error: 'Not your turn' } as AttackResultDetails;

  const defendingPlayerIndex = 1 - attackingPlayerIndex;
  const defendingPlayerBoard = game.players[defendingPlayerIndex].board;

  if (!defendingPlayerBoard) return { error: 'Defending player board not set up' } as AttackResultDetails;

  const availableCoordinates: { x: number; y: number }[] = [];
  for (let x = 0; x < 10; x++) { // Zakładamy planszę 10x10
    for (let y = 0; y < 10; y++) {
      if (!defendingPlayerBoard.shotsReceived.some(shot => shot.x === x && shot.y === y)) {
        availableCoordinates.push({ x, y });
      }
    }
  }

  if (availableCoordinates.length === 0) {
    // Wszystkie pola zostały ostrzelane - to nie powinno się zdarzyć przed końcem gry
    return { error: 'No available cells to shoot at (all cells shot)' } as AttackResultDetails;
  }

  const randomIndex = Math.floor(Math.random() * availableCoordinates.length);
  const randomCoordinates = availableCoordinates[randomIndex];

  console.log(`[GameManager] Random attack for player ${attackingPlayerId} in game ${gameId} chose coordinates (${randomCoordinates.x},${randomCoordinates.y})`);
  // Wywołaj standardową logikę ataku z wylosowanymi koordynatami
  return handleAttack(gameId, attackingPlayerId, randomCoordinates);
}

export function getGameById(gameId: number): Game | undefined {
  return activeGames.get(gameId);
}

export function removeGame(gameId: number): boolean {
  const deleted = activeGames.delete(gameId);
  if (deleted) {
    console.log(`[GameManager] Removed game: ${gameId}`);
  }
  return deleted;
}

// Funkcja do debugowania (opcjonalna)
export function getAllGames(): Game[] {
  return Array.from(activeGames.values());
}

// Funkcja do resetowania stanu na potrzeby testów (opcjonalna)
export function resetGameManager() {
  activeGames.clear();
  console.log('[GameManager] Game manager has been reset.');
}