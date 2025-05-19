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

export interface PlayerBoard {
  ships: Ship[];
  // Można dodać tutaj planszę strzałów, jeśli chcemy ją przechowywać po stronie serwera
  // shots: { x: number; y: number; result: 'miss' | 'hit' | 'sunk' }[];
}

export interface Game {
  gameId: number;
  players: [
    { playerId: number; playerName: string; board?: PlayerBoard; ws?: WebSocket }, // Gracz 1
    { playerId: number; playerName: string; board?: PlayerBoard; ws?: WebSocket }  // Gracz 2
  ];
  currentPlayerIndex: number; // 0 dla gracza 1, 1 dla gracza 2
  status: 'pending_ships' | 'playing' | 'finished';
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
      { playerId: player1.index, playerName: player1.name, ws: player1.ws },
      { playerId: player2.index, playerName: player2.name, ws: player2.ws },
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

  game.players[playerIndex].board = { ships };
  console.log(`[GameManager] Ships added for player ${game.players[playerIndex].playerName} (ID: ${playerId}) in game ${gameId}`);

  // Sprawdź, czy obaj gracze dodali statki
  if (game.players[0].board && game.players[1].board) {
    game.status = 'playing';
    console.log(`[GameManager] Both players have submitted ships for game ${gameId}. Game status changed to 'playing'.`);
  }

  return { game };
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