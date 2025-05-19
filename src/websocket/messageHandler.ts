import WebSocket, { WebSocketServer } from 'ws'; // Zaimportuj WebSocketServer
import * as playerStore from '../playerStore.js';
import * as roomManager from '../roomManager.js'; // Dodajemy roomManager
import * as gameManager from '../gameManager.js'; // Dodajemy gameManager
import { ClientMessage } from '../types/websocket.js';
import { sendMessageToClient, sendUpdateWinners, sendUpdateRoom } from './index.js'; // Dodajemy sendUpdateRoom

// Definicja typów dla danych oczekiwanych przez różne komendy
interface RegData { name: string; password: string; }
interface AddUserToRoomData { indexRoom: number; }
interface AddShipsData { gameId: number; ships: gameManager.Ship[]; indexPlayer: number; } // gameManager.Ship jest już poprawne
interface AttackData { gameId: number; x: number; y: number; indexPlayer: number; }

export function handleWebSocketMessage(
  client: WebSocket,
  parsedMessage: ClientMessage,
  wss: WebSocketServer // Poprawny typ dla instancji serwera WebSocket
): void {
  const { type, data, id } = parsedMessage;
  let responseData: any;
  let responseType = type;
  let shouldSendUpdateWinners = false;
  // Zmienna do przechowywania wyników ataku, aby była dostępna poza switchem
  let attackResultDetailsFromSwitch: gameManager.AttackResultDetails | undefined = undefined;
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
          responseData = { name, index: -1, error: true, errorText: result.error };
        } else if (result.player) {
          const player = result.player;
          responseData = { name: player.name, index: player.id, error: false, errorText: '' };
          client.playerId = player.id;
          client.playerName = player.name;
          shouldSendUpdateWinners = true;
          shouldSendUpdateRoom = true; // Po zalogowaniu wyślij też listę pokoi
          console.log(`[MessageHandler] Player ${player.name} (ID: ${player.id}) registered/logged in.`);
        }
        break;
      }

      case 'create_room': {
        if (client.playerId === undefined || client.playerName === undefined) {
          responseData = { error: true, errorText: 'Player not registered/logged in' };
          responseType = 'create_room'; // Odpowiedź na create_room, ale z błędem
        } else {
          const newRoom = roomManager.createRoom(client.playerId, client.playerName, client);
          // Odpowiedź do klienta tworzącego pokój nie jest zdefiniowana w specyfikacji,
          // ale możemy wysłać potwierdzenie lub nic nie wysyłać bezpośrednio,
          // ponieważ update_room poinformuje o nowym pokoju.
          // responseData = { roomId: newRoom.id }; // Opcjonalnie
          shouldSendUpdateRoom = true;
        }
        break;
      }

      case 'add_user_to_room': {
        if (client.playerId === undefined || client.playerName === undefined) {
          responseData = { error: true, errorText: 'Player not registered/logged in' };
          responseType = 'add_user_to_room'; // Odpowiedź na add_user_to_room, ale z błędem
        } else {
          if (!data) {
            throw new Error('Data for "add_user_to_room" command is missing.');
          }
          const { indexRoom } = JSON.parse(data) as AddUserToRoomData;
          const result = roomManager.addUserToRoom(indexRoom, client.playerId, client.playerName, client);

          if (result.error) {
            responseData = { error: true, errorText: result.error };
            responseType = 'add_user_to_room';
          } else if (result.room) {
            // Jeśli pokój jest pełny, create_game zostanie wysłane poniżej
            // Nie ma specyficznej odpowiedzi dla add_user_to_room, jeśli się powiedzie,
            // klient dowie się o tym przez create_game lub update_room.
            // responseData = { message: "Successfully joined room" }; // Opcjonalnie
            shouldSendUpdateRoom = true;
          }
        }
        break;
      }

      case 'add_ships': {
        if (client.playerId === undefined) {
          responseData = { error: true, errorText: 'Player not registered/logged in' };
          responseType = 'add_ships';
        } else {
          if (!data) {
            throw new Error('Data for "add_ships" command is missing.');
          }
          const { gameId, ships, indexPlayer } = JSON.parse(data) as AddShipsData;
          // Upewnij się, że gracz wysyłający statki to ten sam gracz (indexPlayer)
          if (client.playerId !== indexPlayer) {
            responseData = { error: true, errorText: 'Player ID mismatch' };
            responseType = 'add_ships';
          } else {
            const result = gameManager.addShipsToGame(gameId, client.playerId, ships);
            if (result.error) {
              responseData = { error: true, errorText: result.error };
              responseType = 'add_ships';
            } // Jeśli sukces, odpowiedź zostanie wysłana w bloku 'start_game' poniżej
          }
        }
        break;
      }

      case 'attack': {
        if (client.playerId === undefined) {
          responseData = { error: true, errorText: 'Player not registered/logged in' };
          responseType = 'attack';
          break;
        }
        if (!data) {
          throw new Error(`Data for "attack" command is missing.`);
        }
        const { gameId, x, y, indexPlayer } = JSON.parse(data) as AttackData;

        if (client.playerId !== indexPlayer) {
          responseData = { error: true, errorText: 'Player ID mismatch for attack command' };
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
            console.warn(`[MessageHandler] Attack in game ${gameId} aborted, one player disconnected.`);
            responseData = { error: true, errorText: 'Opponent disconnected' };
            responseType = 'attack';
            break;
        }
        attackResultDetailsFromSwitch = gameManager.handleAttack(gameId, client.playerId, { x, y });
        if (attackResultDetailsFromSwitch.error) {
          responseData = { error: true, errorText: attackResultDetailsFromSwitch.error };
          responseType = 'attack';
        } else {
          // Wiadomość 'attack' z wynikiem strzału zostanie wysłana poniżej, jeśli nie ma błędu
          // i zostanie obsłużona poniżej, poza blokiem switch, jeśli nie ma błędu.
          // Tutaj tylko przygotowujemy dane, jeśli atak był udany.
        }
        break;
      }
      case 'randomAttack': {
        if (client.playerId === undefined) {
          responseData = { error: true, errorText: 'Player not registered/logged in' };
          responseType = 'randomAttack';
          break;
        }
        // Dla randomAttack, 'data' może nie być potrzebne lub może zawierać tylko gameId i indexPlayer
        // Załóżmy, że klient wysyła {"gameId": X, "indexPlayer": Y}
        if (!data) {
            throw new Error('Data for "randomAttack" command is missing (expected gameId, indexPlayer).');
        }
        const { gameId, indexPlayer } = JSON.parse(data) as Omit<AttackData, 'x' | 'y'>; // Omit x, y

        if (client.playerId !== indexPlayer) {
          responseData = { error: true, errorText: 'Player ID mismatch for randomAttack command' };
          responseType = 'randomAttack';
          break;
        }
        
        const game = gameManager.getGameById(gameId);
        if (!game) {
          responseData = { error: true, errorText: 'Game not found for randomAttack' };
          responseType = 'randomAttack';
          break;
        }
        const player1 = game.players[0];
        const player2 = game.players[1];
        if (!player1.ws || !player2.ws) {
            console.warn(`[MessageHandler] RandomAttack in game ${gameId} aborted, one player disconnected.`);
            responseData = { error: true, errorText: 'Opponent disconnected' };
            responseType = 'randomAttack';
            break;
        }

        attackResultDetailsFromSwitch = gameManager.handleRandomAttack(gameId, client.playerId);
        if (attackResultDetailsFromSwitch.error) {
          responseData = { error: true, errorText: attackResultDetailsFromSwitch.error };
          responseType = 'randomAttack';
        } else {
           // Wiadomość 'attack' z wynikiem strzału zostanie wysłana poniżej, jeśli nie ma błędu
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
      console.log(`[MessageHandler] Sent response for command ${responseType}, ID: ${id}, Response Data: ${JSON.stringify(responseData)}`);
    }

    // Sprawdź, czy pokój jest pełny po dodaniu gracza i wyślij create_game
    if (type === 'add_user_to_room' && responseType !== 'error' && responseData?.error !== true) {
        if (!data) return; // Już obsłużone, ale dla pewności
        const { indexRoom } = JSON.parse(data) as AddUserToRoomData;
        const room = roomManager.getRoomById(indexRoom);
        if (room && room.status === 'ready' && room.users.length === 2 && room.gameId !== undefined) {
            console.log(`[MessageHandler] Room ${room.id} is full. Initializing game ${room.gameId}.`);
            // Utwórz grę w gameManager
            gameManager.createNewGame(room.gameId, room.users[0], room.users[1]);
            room.users.forEach((userInRoom: roomManager.RoomUser) => { // Dodano typ dla userInRoom
                if (userInRoom.ws && userInRoom.gamePlayerId !== undefined) {
                    sendMessageToClient(userInRoom.ws, 'create_game', {
                        idGame: room.gameId,
                        idPlayer: userInRoom.gamePlayerId,
                    });
                    console.log(`[MessageHandler] Sent create_game to player ${userInRoom.name} (ID: ${userInRoom.index}) in game ${room.gameId} with gamePlayerId ${userInRoom.gamePlayerId}`);
                }
            });
            roomManager.removeRoom(room.id); // Usuń pokój z listy dostępnych
            shouldSendUpdateRoom = true; // Upewnij się, że update_room zostanie wysłany
        }
    }

    // Sprawdź, czy gra może się rozpocząć po dodaniu statków
    if (type === 'add_ships' && responseType !== 'error' && responseData?.error !== true) {
      if (!data) return;
      const { gameId } = JSON.parse(data) as AddShipsData;
      const game = gameManager.getGameById(gameId);
      if (game && game.status === 'playing') {
        console.log(`[MessageHandler] Game ${game.gameId} is ready to start. Sending start_game and turn messages.`);
        game.players.forEach((player: typeof game.players[0], playerGameIndex: number) => { // Dodano typy
          if (player.ws && player.board) { // Upewnij się, że board istnieje
            sendMessageToClient(player.ws, 'start_game', {
              ships: player.board.ships, // Pozycje własnych statków
              currentPlayerIndex: game.currentPlayerIndex === playerGameIndex ? player.playerId : game.players[game.currentPlayerIndex].playerId, // ID gracza, który zaczyna
            });
            sendMessageToClient(player.ws, 'turn', {
              currentPlayer: game.players[game.currentPlayerIndex].playerId,
            });
            console.log(`[MessageHandler] Sent start_game and turn to player ${player.playerName} (ID: ${player.playerId})`);
          }
        });
        // Gra się rozpoczęła, nie ma potrzeby wysyłać update_room, bo pokój już został usunięty
      }
    }

    // Handle turn and finish messages after attack or randomAttack
    // Ten blok jest teraz kluczowy dla wysyłania aktualizacji po udanym ataku (zwykłym lub losowym)
    if ((type === 'attack' || type === 'randomAttack') && !responseData?.error) {
      // Użyj attackResultDetailsFromSwitch, które zostało ustawione w bloku switch
      if (attackResultDetailsFromSwitch && !attackResultDetailsFromSwitch.error) {
        const game = gameManager.getGameById(attackResultDetailsFromSwitch.gameId);
        if (!game) {
          // To nie powinno się zdarzyć, jeśli attackResultDetailsFromSwitch jest poprawne
          console.error(`[MessageHandler] Game not found for ID ${attackResultDetailsFromSwitch.gameId} after successful attack.`);
          return;
        }

        // Wyślij wiadomość 'attack' z wynikiem do obu graczy
        const attackMessagePayload: any = {
          position: { x: attackResultDetailsFromSwitch.coordinates.x, y: attackResultDetailsFromSwitch.coordinates.y },
          currentPlayer: attackResultDetailsFromSwitch.attackingPlayerId,
          status: attackResultDetailsFromSwitch.result,
        };
        if (attackResultDetailsFromSwitch.shipKilled) {
          attackMessagePayload.ship = attackResultDetailsFromSwitch.shipKilled;
        }
        game.players.forEach((p: typeof game.players[0]) => { // Dodano typ dla p
          if (p.ws) sendMessageToClient(p.ws, 'attack', attackMessagePayload);
        });
        console.log(`[MessageHandler] Broadcasted 'attack' for game ${attackResultDetailsFromSwitch.gameId}: ${JSON.stringify(attackMessagePayload)}`);

        // Logika 'finish' lub 'turn'
        if (game.status === 'finished' && game.winner !== undefined) {
          const winnerId = game.winner;
          const finishPayload = { winPlayer: winnerId };
          game.players.forEach((p: typeof game.players[0]) => { // Dodano typ dla p
            if (p.ws) sendMessageToClient(p.ws, 'finish', finishPayload);
          });
          console.log(`[MessageHandler] Broadcasted 'finish' for game ${game.gameId}: ${JSON.stringify(finishPayload)}`);
          
          playerStore.incrementWins(winnerId);
          shouldSendUpdateWinners = true;
          gameManager.removeGame(game.gameId);
        } else if (game.status === 'playing') {
          const turnPayload = { currentPlayer: game.players[game.currentPlayerIndex].playerId };
          game.players.forEach((p: typeof game.players[0]) => { // Dodano typ dla p
            if (p.ws) sendMessageToClient(p.ws, 'turn', turnPayload);
          });
          console.log(`[MessageHandler] Broadcasted 'turn' for game ${game.gameId}: ${JSON.stringify(turnPayload)}`);
        }
      } // koniec if (attackResultDetailsFromSwitch && !attackResultDetailsFromSwitch.error)
    }


    if (shouldSendUpdateWinners) {
      sendUpdateWinners(wss);
      console.log('[MessageHandler] Triggered update_winners broadcast.');
    }
    if (shouldSendUpdateRoom) {
      sendUpdateRoom(wss);
      console.log('[MessageHandler] Triggered update_room broadcast.');
    }

  } catch (error) {
    console.error(`[MessageHandler] Error processing message type ${type}:`, error);
    const errorText = error instanceof Error ? error.message : 'Unknown error processing request';
    sendMessageToClient(client, type, { error: true, errorText }, id);
  }
}