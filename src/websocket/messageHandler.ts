import WebSocket, { WebSocketServer } from 'ws';
import * as playerStore from '../playerStore.js';
import * as roomManager from '../roomManager.js';
import * as gameManager from '../gameManager.js';
import { ClientMessage } from '../types/websocket.js';
import { sendMessageToClient } from './messageSender.js';
import * as bot from '../bot.js';
import { sendUpdateRoom, sendUpdateWinners } from './index.js';

interface RegData {
  name: string;
  password: string;
}
interface AddUserToRoomData {
  indexRoom: number;
}
interface AddShipsData {
  gameId: number;
  ships: gameManager.Ship[];
  indexPlayer: number;
}
interface AttackData {
  gameId: number;
  x: number;
  y: number;
  indexPlayer: number;
}
interface AttackMessagePayload {
  position: { x: number; y: number };
  currentPlayer: number;
  status: 'miss' | 'shot' | 'killed';
  ship?: gameManager.Ship;
}

interface HasOptionalError {
  error?: unknown;
}

export function handleWebSocketMessage(
  client: WebSocket,
  parsedMessage: ClientMessage,
  wss: WebSocketServer
): void {
  const { type, data, id } = parsedMessage;
  let responseData: unknown;
  let responseType = type;
  let shouldSendUpdateWinners = false;

  let attackResultDetailsFromSwitch:
    | gameManager.AttackResultDetails
    | undefined = undefined;
  let shouldSendUpdateRoom = false;

  console.log(
    `[MessageHandler] Processing command: ${type}, ID: ${id}, Raw Data: ${data}`
  );

  try {
    switch (type) {
      case 'reg': {
        if (!data) {
          throw new Error('Data for "reg" command is missing.');
        }
        const { name, password } = JSON.parse(data) as RegData;
        const result = playerStore.registerOrLoginPlayer(name, password);

        if (result.error) {
          responseData = {
            name,
            index: -1,
            error: true,
            errorText: result.error,
          };
        } else if (result.player) {
          const player = result.player;
          responseData = {
            name: player.name,
            index: player.id,
            error: false,
            errorText: '',
          };
          client.playerId = player.id;
          client.playerName = player.name;
          shouldSendUpdateWinners = true;
          shouldSendUpdateRoom = true;
          console.log(
            `[MessageHandler] Player ${player.name} (ID: ${player.id}) registered/logged in.`
          );
        }
        break;
      }

      case 'create_room': {
        if (client.playerId === undefined || client.playerName === undefined) {
          responseData = {
            error: true,
            errorText: 'Player not registered/logged in',
          };
          responseType = 'create_room';
        } else {
          roomManager.createRoom(client.playerId, client.playerName, client);

          shouldSendUpdateRoom = true;
        }
        break;
      }

      case 'create_single_player_game': {
        console.log(
          `[MessageHandler] Received create_single_player_game command from player ID: ${client.playerId}`
        );
        if (client.playerId === undefined || client.playerName === undefined) {
          responseData = {
            error: true,
            errorText: 'Player not registered/logged in',
          };
          responseType = 'create_single_player_game';
        } else {
          const botPlayerId = -1;
          const botPlayer = {
            playerId: botPlayerId,
            playerName: 'Bot',
            isBot: true,
          };

          const humanPlayerForGame = {
            playerId: client.playerId,
            playerName: client.playerName,
            ws: client,
          };
          const gameId = roomManager.getNextGameId();
          const newGame = gameManager.createNewGame(
            gameId,
            humanPlayerForGame,
            botPlayer
          );

          console.log(
            `[MessageHandler] Game ${gameId} created for single player mode.`
          );

          const botShips = bot.placeBotShips();
          gameManager.addShipsToGame(gameId, botPlayerId, botShips);

          console.log(
            `[MessageHandler] Bot ships placed and added to game ${gameId}.`
          );

          sendMessageToClient(client, 'create_game', {
            idGame: newGame.gameId,

            idPlayer: 1,
          });
          console.log(
            `[MessageHandler] Created single player game ${newGame.gameId} for player ${client.playerName} (ID: ${client.playerId}) vs Bot.`
          );
        }
        break;
      }

      case 'add_user_to_room': {
        if (client.playerId === undefined || client.playerName === undefined) {
          responseData = {
            error: true,
            errorText: 'Player not registered/logged in',
          };
          responseType = 'add_user_to_room';
        } else {
          if (!data) {
            throw new Error('Data for "add_user_to_room" command is missing.');
          }
          const { indexRoom } = JSON.parse(data) as AddUserToRoomData;
          const result = roomManager.addUserToRoom(
            indexRoom,
            client.playerId,
            client.playerName,
            client
          );

          if (result.error) {
            responseData = { error: true, errorText: result.error };
            responseType = 'add_user_to_room';
          } else if (result.room) {
            shouldSendUpdateRoom = true;
          }
        }
        break;
      }

      case 'add_ships': {
        if (client.playerId === undefined) {
          responseData = {
            error: true,
            errorText: 'Player not registered/logged in',
          };
          responseType = 'add_ships';
        } else {
          if (!data) {
            throw new Error('Data for "add_ships" command is missing.');
          }
          const { gameId, ships, indexPlayer } = JSON.parse(
            data
          ) as AddShipsData;

          if (client.playerId !== indexPlayer) {
            responseData = { error: true, errorText: 'Player ID mismatch' };
            responseType = 'add_ships';
          } else {
            const result = gameManager.addShipsToGame(
              gameId,
              client.playerId,
              ships
            );
            if (result.error) {
              console.error(
                `[MessageHandler] Error adding ships for player ${client.playerId} in game ${gameId}: ${result.error}`
              );
              responseData = { error: true, errorText: result.error };
              responseType = 'add_ships';
            }
          }
        }
        break;
      }

      case 'attack': {
        if (client.playerId === undefined) {
          responseData = {
            error: true,
            errorText: 'Player not registered/logged in',
          };
          responseType = 'attack';
          break;
        }
        if (!data) {
          throw new Error(`Data for "attack" command is missing.`);
        }
        const { gameId, x, y, indexPlayer } = JSON.parse(data) as AttackData;

        if (client.playerId !== indexPlayer) {
          responseData = {
            error: true,
            errorText: 'Player ID mismatch for attack command',
          };
          responseType = 'attack';
          break;
        }

        const game = gameManager.getGameById(gameId);
        if (!game) {
          responseData = { error: true, errorText: 'Game not found' };
          responseType = 'attack';
          break;
        }
        const player1 = game.players[0];
        const player2 = game.players[1];
        if (!player1.ws || !player2.ws) {
          console.warn(
            `[MessageHandler] Attack in game ${gameId} aborted, one player disconnected.`
          );
          responseData = { error: true, errorText: 'Opponent disconnected' };
          responseType = 'attack';
          break;
        }
        attackResultDetailsFromSwitch = gameManager.handleAttack(
          gameId,
          client.playerId,
          { x, y }
        );
        if (attackResultDetailsFromSwitch.error) {
          responseData = {
            error: true,
            errorText: attackResultDetailsFromSwitch.error,
          };
          responseType = 'attack';
        } else {
        }
        break;
      }
      case 'randomAttack': {
        if (client.playerId === undefined) {
          responseData = {
            error: true,
            errorText: 'Player not registered/logged in',
          };
          responseType = 'randomAttack';
          break;
        }

        if (!data) {
          throw new Error(
            'Data for "randomAttack" command is missing (expected gameId, indexPlayer).'
          );
        }
        const { gameId, indexPlayer } = JSON.parse(data) as Omit<
          AttackData,
          'x' | 'y'
        >;

        if (client.playerId !== indexPlayer) {
          responseData = {
            error: true,
            errorText: 'Player ID mismatch for randomAttack command',
          };
          responseType = 'randomAttack';
          break;
        }

        const game = gameManager.getGameById(gameId);
        if (!game) {
          responseData = {
            error: true,
            errorText: 'Game not found for randomAttack',
          };
          responseType = 'randomAttack';
          break;
        }
        const player1 = game.players[0];
        const player2 = game.players[1];
        if (!player1.ws || !player2.ws) {
          console.warn(
            `[MessageHandler] RandomAttack in game ${gameId} aborted, one player disconnected.`
          );
          responseData = { error: true, errorText: 'Opponent disconnected' };
          responseType = 'randomAttack';
          break;
        }

        attackResultDetailsFromSwitch = gameManager.handleRandomAttack(
          gameId,
          client.playerId
        );
        if (attackResultDetailsFromSwitch.error) {
          responseData = {
            error: true,
            errorText: attackResultDetailsFromSwitch.error,
          };
          responseType = 'randomAttack';
        } else {
        }
        break;
      }

      default:
        responseData = { message: `Received and processed command: ${type}` };
        console.log(`[MessageHandler] Unknown command type: ${type}`);
        break;
    }

    if (responseData) {
      sendMessageToClient(client, responseType, responseData, id);
      console.log(
        `[MessageHandler] Sent response for command ${responseType}, ID: ${id}, Response Data: ${JSON.stringify(responseData as HasOptionalError)}`
      );
    }

    if (
      type === 'add_user_to_room' &&
      responseType !== 'error' &&
      (responseData as HasOptionalError)?.error !== true
    ) {
      if (!data) return;
      const { indexRoom } = JSON.parse(data) as AddUserToRoomData;
      const room = roomManager.getRoomById(indexRoom);
      if (
        room &&
        room.status === 'ready' &&
        room.users.length === 2 &&
        room.gameId !== undefined
      ) {
        console.log(
          `[MessageHandler] Room ${room.id} is full. Initializing game ${room.gameId}.`
        );

        const player1Input = {
          playerId: room.users[0].index,
          playerName: room.users[0].name,
          ws: room.users[0].ws,
        };
        const player2Input = {
          playerId: room.users[1].index,
          playerName: room.users[1].name,
          ws: room.users[1].ws,
        };
        gameManager.createNewGame(room.gameId, player1Input, player2Input);
        room.users.forEach((userInRoom: roomManager.RoomUser) => {
          if (userInRoom.ws && userInRoom.gamePlayerId !== undefined) {
            sendMessageToClient(userInRoom.ws, 'create_game', {
              idGame: room.gameId,
              idPlayer: userInRoom.gamePlayerId,
            });
            console.log(
              `[MessageHandler] Sent create_game to player ${userInRoom.name} (ID: ${userInRoom.index}) in game ${room.gameId} with gamePlayerId ${userInRoom.gamePlayerId}`
            );
          }
        });
        roomManager.removeRoom(room.id);
        shouldSendUpdateRoom = true;
      }
    }

    if (
      type === 'add_ships' &&
      responseType !== 'error' &&
      responseData?.error !== true
    ) {
      if (!data) return;
      console.log(
        `[MessageHandler] Checking if game can start after add_ships from player ${client.playerId}.`
      );
      const { gameId } = JSON.parse(data) as AddShipsData;
      const game = gameManager.getGameById(gameId);
      if (game && game.status === 'playing') {
        console.log(
          `[MessageHandler] Game ${game.gameId} is ready to start. Sending start_game and turn messages.`
        );
        game.players.forEach(
          (player: (typeof game.players)[0], playerGameIndex: number) => {
            if (player.ws && player.board) {
              sendMessageToClient(player.ws, 'start_game', {
                ships: player.board.ships,
                currentPlayerIndex:
                  game.currentPlayerIndex === playerGameIndex
                    ? player.playerId
                    : game.players[game.currentPlayerIndex].playerId,
              });
              sendMessageToClient(player.ws, 'turn', {
                currentPlayer: game.players[game.currentPlayerIndex].playerId,
              });
              console.log(
                `[MessageHandler] Sent start_game and turn to player ${player.playerName} (ID: ${player.playerId})`
              );

              const currentPlayerAfterStart =
                game.players[game.currentPlayerIndex];
              if (
                currentPlayerAfterStart.isBot &&
                currentPlayerAfterStart.playerId ===
                  game.players[game.currentPlayerIndex].playerId
              ) {
                console.log(
                  `[MessageHandler] Bot (ID: ${currentPlayerAfterStart.playerId}) starts the game ${game.gameId}. Triggering bot move.`
                );
                setImmediate(() => {
                  handleBotTurn(
                    game.gameId,
                    currentPlayerAfterStart.playerId,
                    wss
                  );
                });
              }
            }
          }
        );
      }
    }

    if (
      (type === 'attack' || type === 'randomAttack') &&
      !(responseData as HasOptionalError)?.error
    ) {
      if (
        attackResultDetailsFromSwitch &&
        !attackResultDetailsFromSwitch.error
      ) {
        const game = gameManager.getGameById(
          attackResultDetailsFromSwitch.gameId
        );
        if (!game) {
          console.error(
            `[MessageHandler] Game not found for ID ${attackResultDetailsFromSwitch.gameId} after successful attack.`
          );
          return;
        }

        const attackMessagePayload: AttackMessagePayload = {
          position: {
            x: attackResultDetailsFromSwitch.coordinates.x,
            y: attackResultDetailsFromSwitch.coordinates.y,
          },
          currentPlayer: attackResultDetailsFromSwitch.attackingPlayerId,
          status: attackResultDetailsFromSwitch.result,
        };
        if (attackResultDetailsFromSwitch.shipKilled) {
          attackMessagePayload.ship = attackResultDetailsFromSwitch.shipKilled;
        }
        game.players.forEach((p: (typeof game.players)[0]) => {
          if (p.ws) sendMessageToClient(p.ws, 'attack', attackMessagePayload);
        });
        console.log(
          `[MessageHandler] Broadcasted 'attack' for game ${attackResultDetailsFromSwitch.gameId}: ${JSON.stringify(attackMessagePayload)}`
        );

        if (game.status === 'finished' && game.winner !== undefined) {
          const winnerId = game.winner;
          const finishPayload = { winPlayer: winnerId };
          game.players.forEach((p: (typeof game.players)[0]) => {
            if (p.ws) sendMessageToClient(p.ws, 'finish', finishPayload);
          });
          console.log(
            `[MessageHandler] Broadcasted 'finish' for game ${game.gameId}: ${JSON.stringify(finishPayload)}`
          );

          playerStore.incrementWins(winnerId);
          shouldSendUpdateWinners = true;
          gameManager.removeGame(game.gameId);
        } else if (game.status === 'playing') {
          const turnPayload = {
            currentPlayer: game.players[game.currentPlayerIndex].playerId,
          };
          game.players.forEach((p: (typeof game.players)[0]) => {
            if (p.ws) sendMessageToClient(p.ws, 'turn', turnPayload);
          });
          console.log(
            `[MessageHandler] Broadcasted 'turn' for game ${game.gameId}: ${JSON.stringify(turnPayload)}`
          );

          const currentPlayer = game.players[game.currentPlayerIndex];
          if (currentPlayer.isBot) {
            console.log(
              `[MessageHandler] It's Bot's turn in game ${game.gameId}. Triggering bot move.`
            );

            setImmediate(() => {
              handleBotTurn(game.gameId, currentPlayer.playerId, wss);
            });
          }
        }
      }
    }

    async function handleBotTurn(
      gameId: number,
      botPlayerId: number,
      wss: WebSocketServer
    ) {
      const game = gameManager.getGameById(gameId);

      if (
        !game ||
        game.status === 'pending_ships' ||
        game.status === 'finished'
      ) {
        console.warn(
          `[MessageHandler] Bot turn attempted for game ${gameId} but game not found or not playing.`
        );
        return;
      }

      const currentPlayer = game.players[game.currentPlayerIndex];
      if (!currentPlayer.isBot || currentPlayer.playerId !== botPlayerId) {
        console.warn(
          `[MessageHandler] Bot turn attempted for game ${gameId} but it's not bot ${botPlayerId}'s turn.`
        );
        return;
      }

      const botAttackResultDetails = gameManager.handleRandomAttack(
        gameId,
        botPlayerId
      );

      if ((botAttackResultDetails as HasOptionalError)?.error) {
        console.error(
          `[MessageHandler] Bot attack failed in game ${gameId}: ${botAttackResultDetails.error}`
        );

        return;
      }

      const currentStatusAfterAttack =
        game.status as gameManager.Game['status'];

      const attackMessagePayload: AttackMessagePayload = {
        position: {
          x: botAttackResultDetails.coordinates.x,
          y: botAttackResultDetails.coordinates.y,
        },
        currentPlayer: botAttackResultDetails.attackingPlayerId,
        status: botAttackResultDetails.result,
      };
      if (botAttackResultDetails.shipKilled) {
        attackMessagePayload.ship = botAttackResultDetails.shipKilled;
      }

      const humanPlayer = game.players.find((p) => !p.isBot);
      if (humanPlayer?.ws) {
        sendMessageToClient(humanPlayer.ws, 'attack', attackMessagePayload);
        console.log(
          `[MessageHandler] Sent 'attack' from Bot for game ${gameId}: ${JSON.stringify(attackMessagePayload)}`
        );
      }

      if (
        currentStatusAfterAttack === 'finished' &&
        game.winner !== undefined
      ) {
        const winnerId = game.winner;
        const finishPayload = { winPlayer: winnerId };

        if (humanPlayer?.ws) {
          sendMessageToClient(humanPlayer.ws, 'finish', finishPayload);
          console.log(
            `[MessageHandler] Sent 'finish' from Bot for game ${game.gameId}: ${JSON.stringify(finishPayload)}`
          );
        }

        shouldSendUpdateWinners = true;
        gameManager.removeGame(game.gameId);
      } else if (currentStatusAfterAttack === 'playing') {
        const turnPayload = {
          currentPlayer: game.players[game.currentPlayerIndex].playerId,
        };

        if (humanPlayer?.ws) {
          sendMessageToClient(humanPlayer.ws, 'turn', turnPayload);
          console.log(
            `[MessageHandler] Sent 'turn' after Bot move for game ${game.gameId}: ${JSON.stringify(turnPayload)}`
          );
        }

        if (!botAttackResultDetails.turnChanged) {
          console.log(
            `[MessageHandler] Bot hit! Bot shoots again in game ${game.gameId}.`
          );
          setImmediate(() => {
            handleBotTurn(game.gameId, botPlayerId, wss);
          });
        }
      } else if (currentStatusAfterAttack === 'pending_ships') {
        console.log(
          `[MessageHandler] Game ${game.gameId} is still waiting for ships to be placed.`
        );
      }

      if (shouldSendUpdateWinners) {
        sendUpdateWinners(wss);
        console.log(
          '[MessageHandler] Triggered update_winners broadcast after bot game.'
        );
        shouldSendUpdateWinners = false;
      }
    }

    if (shouldSendUpdateRoom) {
      sendUpdateRoom(wss);
      console.log('[MessageHandler] Triggered update_room broadcast.');
      shouldSendUpdateRoom = false;
    }
  } catch (error) {
    console.error(
      `[MessageHandler] Error processing message type ${type}:`,
      error
    );
    const errorText =
      error instanceof Error
        ? error.message
        : 'Unknown error processing request';
    sendMessageToClient(client, type, { error: true, errorText }, id);
  } finally {
    console.log(
      `------------------------------------- Message Handling End (Type: ${type}) -------------------------------------`
    );
  }
}
