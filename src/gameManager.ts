import WebSocket from 'ws';

export interface Ship {
  position: {
    x: number;
    y: number;
  };
  direction: boolean;
  length: number;
  type: 'small' | 'medium' | 'large' | 'huge';
  hits: boolean[];
}

export interface Shot {
  x: number;
  y: number;
  result: 'miss' | 'shot' | 'killed';
}

export interface PlayerBoard {
  ships: Ship[];

  shotsReceived: Shot[];
}

export interface Game {
  gameId: number;
  players: [
    {
      playerId: number;
      playerName: string;
      board: PlayerBoard;
      ws?: WebSocket;
      isBot?: boolean;
    },
    {
      playerId: number;
      playerName: string;
      board: PlayerBoard;
      ws?: WebSocket;
      isBot?: boolean;
    },
  ];
  currentPlayerIndex: number;
  status: 'pending_ships' | 'playing' | 'finished';
  winner?: number;
}

const activeGames = new Map<number, Game>();

interface GamePlayerInput {
  playerId: number;
  playerName: string;
  ws?: WebSocket;
  isBot?: boolean;
}

export function createNewGame(
  gameId: number,
  player1Input: GamePlayerInput,
  player2Input: GamePlayerInput
): Game {
  if (activeGames.has(gameId)) {
    console.warn(
      `[GameManager] Game with ID ${gameId} already exists. Overwriting.`
    );
  }

  const p1GameData = {
    ...player1Input,
    board: { ships: [], shotsReceived: [] },
  };
  const p2GameData = {
    ...player2Input,
    board: { ships: [], shotsReceived: [] },
  };

  const newGame: Game = {
    gameId,
    players: [
      p1GameData as {
        playerId: number;
        playerName: string;
        board: PlayerBoard;
        ws?: WebSocket;
        isBot?: boolean;
      },
      p2GameData as {
        playerId: number;
        playerName: string;
        board: PlayerBoard;
        ws?: WebSocket;
        isBot?: boolean;
      },
    ],
    currentPlayerIndex: Math.random() < 0.5 ? 0 : 1,
    status: 'pending_ships',
  };

  activeGames.set(gameId, newGame);
  console.log(
    `[GameManager] Created new game: ${gameId} with players ${player1Input.playerName} and ${player2Input.playerName}. Player ${newGame.players[newGame.currentPlayerIndex].playerName} starts.`
  );
  return newGame;
}

export function addShipsToGame(
  gameId: number,
  playerId: number,
  ships: Ship[]
): { game?: Game; error?: string } {
  const game = activeGames.get(gameId);
  if (!game) {
    return { error: 'Game not found' };
  }

  const playerIndex = game.players.findIndex((p) => p.playerId === playerId);
  if (playerIndex === -1) {
    return { error: 'Player not found in this game' };
  }

  if (
    game.players[playerIndex].board &&
    game.players[playerIndex].board.ships.length > 0
  ) {
    return { error: 'Player has already submitted ships for this game' };
  }

  game.players[playerIndex].board = {
    ships: ships.map((s) => ({ ...s, hits: Array(s.length).fill(false) })),
    shotsReceived: [],
  };
  console.log(
    `[GameManager] Ships added for player ${game.players[playerIndex].playerName} (ID: ${playerId}) in game ${gameId}`
  );

  if (
    game.players[0].board?.ships.length &&
    game.players[1].board?.ships.length
  ) {
    game.status = 'playing';
    console.log(
      `[GameManager] Both players have submitted ships for game ${gameId}. Game status changed to 'playing'.`
    );
  }

  return { game };
}

function formatShipsForLog(ships: Ship[], boardSize = 10): string {
  const board: string[][] = Array(boardSize)
    .fill(null)
    .map(() => Array(boardSize).fill('.'));

  ships.forEach((ship) => {
    for (let i = 0; i < ship.length; i++) {
      const x = ship.position.x + (ship.direction ? 0 : i);
      const y = ship.position.y + (ship.direction ? i : 0);
      if (x >= 0 && x < boardSize && y >= 0 && y < boardSize) {
        board[y][x] = 'X';
      }
    }
  });

  let logString = '\nBoard Visualization:\n  ';
  for (let i = 0; i < boardSize; i++) {
    logString += `${i} `;
  }
  logString += '\n';
  board.forEach((row, rowIndex) => {
    logString += `${rowIndex} ${row.join(' ')}\n`;
  });
  return logString;
}

function getShipAtCoordinates(
  coordinates: { x: number; y: number },
  ships: Ship[]
): { ship: Ship; segmentIndex: number } | undefined {
  console.log(
    `[getShipAtCoordinates] Checking for ship at Target Coords: (${coordinates.x}, ${coordinates.y})`
  );

  for (const ship of ships) {
    console.log(
      `[getShipAtCoordinates] Iterating ship: type=${ship.type}, len=${ship.length}, pos=(${ship.position.x},${ship.position.y}), dir=${ship.direction}`
    );
    for (let i = 0; i < ship.length; i++) {
      if (ship.hits[i]) continue;

      const shipX = ship.position.x + (ship.direction ? 0 : i);
      const shipY = ship.position.y + (ship.direction ? i : 0);

      if (shipX === coordinates.x && shipY === coordinates.y) {
        console.log(
          `[getShipAtCoordinates]   >>> HIT on ship type ${ship.type} at segment ${i} (${shipX},${shipY})! Target Coords: (${coordinates.x},${coordinates.y})`
        );
        return { ship, segmentIndex: i };
      }
    }
  }
  console.log(
    `[getShipAtCoordinates]   >>> MISS. No ship segment found at Target Coords: (${coordinates.x}, ${coordinates.y})`
  );
  return undefined;
}

function isShipKilled(ship: Ship): boolean {
  return ship.hits.every((hit) => hit === true);
}

function markSurroundingCellsAsMiss(board: PlayerBoard, ship: Ship): void {
  const boardSize = 10;
  for (let i = 0; i < ship.length; i++) {
    const shipX = ship.position.x + (ship.direction ? 0 : i);
    const shipY = ship.position.y + (ship.direction ? i : 0);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const checkX = shipX + dx;
        const checkY = shipY + dy;

        if (
          checkX >= 0 &&
          checkX < boardSize &&
          checkY >= 0 &&
          checkY < boardSize
        ) {
          const alreadyShot = board.shotsReceived.some(
            (s) => s.x === checkX && s.y === checkY
          );
          if (!alreadyShot) {
            board.shotsReceived.push({ x: checkX, y: checkY, result: 'miss' });
            console.log(
              `[GameManager] Marked surrounding cell (${checkX},${checkY}) as miss for ship type ${ship.type}`
            );
          }
        }
      }
    }
  }
}

function checkWinCondition(defendingPlayerBoard: PlayerBoard): boolean {
  if (
    !defendingPlayerBoard ||
    !defendingPlayerBoard.ships ||
    !defendingPlayerBoard.shotsReceived
  )
    return false;
  return defendingPlayerBoard.ships.every((ship) => isShipKilled(ship));
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
  console.log(`\n[handleAttack] ========= NEW ATTACK SEQUENCE START =========`);
  console.log(
    `[handleAttack] GameID: ${gameId}, AttackerID: ${attackingPlayerId}, TargetCoords: (${coordinates.x},${coordinates.y})`
  );
  if (!game) return { error: 'Game not found' } as AttackResultDetails;
  if (game.status !== 'playing')
    return { error: 'Game is not active' } as AttackResultDetails;

  const attackingPlayerIndex = game.players.findIndex(
    (p) => p.playerId === attackingPlayerId
  );
  if (attackingPlayerIndex === -1)
    return {
      error: 'Attacking player not found in this game',
    } as AttackResultDetails;
  if (game.currentPlayerIndex !== attackingPlayerIndex)
    return { error: 'Not your turn' } as AttackResultDetails;

  if (
    coordinates.x < 0 ||
    coordinates.x > 9 ||
    coordinates.y < 0 ||
    coordinates.y > 9
  ) {
    return { error: 'Invalid coordinates' } as AttackResultDetails;
  }

  const defendingPlayerIndex = 1 - attackingPlayerIndex;
  const defendingPlayer = game.players[defendingPlayerIndex];
  console.log(
    `[handleAttack] DefendingPlayerID: ${defendingPlayer.playerId}. Ships on their board BEFORE check (raw): ${JSON.stringify(defendingPlayer.board.ships, null, 2)}`
  );
  console.log(formatShipsForLog(defendingPlayer.board.ships));

  if (!defendingPlayer.board)
    return {
      error: 'Defending player board not set up',
    } as AttackResultDetails;

  if (
    defendingPlayer.board.shotsReceived.some(
      (shot) => shot.x === coordinates.x && shot.y === coordinates.y
    )
  ) {
    return { error: 'Cell already shot' } as AttackResultDetails;
  }

  let attackResult: 'miss' | 'shot' | 'killed' = 'miss';
  let shipKilled: Ship | undefined = undefined;
  let turnChanged = true;

  const hitResult = getShipAtCoordinates(
    coordinates,
    defendingPlayer.board.ships
  );
  console.log(
    `[handleAttack] Result from getShipAtCoordinates: ${hitResult ? `HIT on ship type ${hitResult.ship.type} at segment ${hitResult.segmentIndex}` : 'MISS (returned undefined)'}`
  );

  if (hitResult) {
    const { ship: hitShip, segmentIndex } = hitResult;

    attackResult = 'shot';
    turnChanged = false;
    console.log(
      `[handleAttack] HIT confirmed by handleAttack. turnChanged is now: ${turnChanged}. Player ${attackingPlayerId} continues turn.`
    );
    console.log(
      `[handleAttack] Details of hit ship (as returned by getShipAtCoordinates): ${JSON.stringify(hitShip, null, 2)}`
    );

    defendingPlayer.board.shotsReceived.push({
      x: coordinates.x,
      y: coordinates.y,
      result: 'shot',
    });
    hitShip.hits[segmentIndex] = true;

    if (isShipKilled(hitShip)) {
      attackResult = 'killed';
      shipKilled = hitShip;

      for (let i = 0; i < hitShip.length; i++) {
        const shipX = hitShip.position.x + (hitShip.direction ? 0 : i);
        const shipY = hitShip.position.y + (hitShip.direction ? i : 0);
        const shotIndex = defendingPlayer.board.shotsReceived.findIndex(
          (s) => s.x === shipX && s.y === shipY
        );
        if (shotIndex !== -1) {
          defendingPlayer.board.shotsReceived[shotIndex].result = 'killed';
        }
      }
      console.log(
        `[GameManager] Ship killed: ${hitShip.type} in game ${gameId}`
      );

      markSurroundingCellsAsMiss(defendingPlayer.board, hitShip);
    }
  } else {
    attackResult = 'miss';
    defendingPlayer.board.shotsReceived.push({
      x: coordinates.x,
      y: coordinates.y,
      result: 'miss',
    });
  }

  let winner: number | undefined = undefined;
  if (attackResult === 'killed' || attackResult === 'shot') {
    if (checkWinCondition(defendingPlayer.board)) {
      winner = attackingPlayerId;
      game.status = 'finished';
      game.winner = winner;
      console.log(
        `[GameManager] Game ${gameId} finished. Winner: ${attackingPlayerId}`
      );
    }
  }

  if (turnChanged && game.status === 'playing') {
    game.currentPlayerIndex = defendingPlayerIndex;
    console.log(
      `[handleAttack] Turn will change. New currentPlayerIndex: ${game.currentPlayerIndex} (Player ID: ${game.players[game.currentPlayerIndex].playerId})`
    );
  }
  const nextPlayerId = game.players[game.currentPlayerIndex].playerId;

  console.log(
    `[handleAttack] Final outcome: Result=${attackResult}, TurnChanged=${turnChanged}, NextPlayer=${nextPlayerId}`
  );
  console.log(
    '------------------------------------- Attack Sequence End -------------------------------------'
  );
  return {
    gameId,
    attackingPlayerId,
    coordinates,
    result: attackResult,
    shipKilled,
    turnChanged,
    nextPlayerId,
    winner,
  };
}

export function handleRandomAttack(
  gameId: number,
  attackingPlayerId: number
): AttackResultDetails {
  const game = activeGames.get(gameId);
  if (!game) return { error: 'Game not found' } as AttackResultDetails;

  if (game.status !== 'playing')
    return { error: 'Game is not active' } as AttackResultDetails;
  const attackingPlayerIndex = game.players.findIndex(
    (p) => p.playerId === attackingPlayerId
  );
  if (attackingPlayerIndex === -1)
    return { error: 'Attacking player not found' } as AttackResultDetails;
  if (game.currentPlayerIndex !== attackingPlayerIndex)
    return { error: 'Not your turn' } as AttackResultDetails;

  const defendingPlayerIndex = 1 - attackingPlayerIndex;
  const defendingPlayerBoard = game.players[defendingPlayerIndex].board;

  if (!defendingPlayerBoard)
    return {
      error: 'Defending player board not set up',
    } as AttackResultDetails;

  const availableCoordinates: { x: number; y: number }[] = [];
  for (let x = 0; x < 10; x++) {
    for (let y = 0; y < 10; y++) {
      if (
        !defendingPlayerBoard.shotsReceived.some(
          (shot) => shot.x === x && shot.y === y
        )
      ) {
        availableCoordinates.push({ x, y });
      }
    }
  }

  if (availableCoordinates.length === 0) {
    return {
      error: 'No available cells to shoot at (all cells shot)',
    } as AttackResultDetails;
  }

  const randomIndex = Math.floor(Math.random() * availableCoordinates.length);
  const randomCoordinates = availableCoordinates[randomIndex];

  console.log(
    `[GameManager] Random attack for player ${attackingPlayerId} in game ${gameId} chose coordinates (${randomCoordinates.x},${randomCoordinates.y})`
  );

  const result = handleAttack(gameId, attackingPlayerId, randomCoordinates);

  return result;
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

export function getAllGames(): Game[] {
  return Array.from(activeGames.values());
}

export function resetGameManager() {
  activeGames.clear();
  console.log('[GameManager] Game manager has been reset.');
}

export function findGameByPlayerId(playerId: number): Game | undefined {
  for (const game of activeGames.values()) {
    if (game.players.some((p) => p.playerId === playerId)) {
      return game;
    }
  }
  return undefined;
}
