import WebSocket, { WebSocketServer } from 'ws'; // Zaimportuj WebSocketServer
import * as playerStore from '../playerStore.js';
import * as roomManager from '../roomManager.js'; // Dodajemy roomManager
import * as gameManager from '../gameManager.js'; // Dodajemy gameManager
import { ClientMessage } from '../types/websocket.js';
import { sendMessageToClient, broadcastMessage } from './messageSender.js'; // Importujemy z messageSender
import * as bot from '../bot.js'; // Importujemy moduł bota
import { sendUpdateRoom, sendUpdateWinners } from './index.js'; // Importujemy specyficzne funkcje broadcast z index.js

// Definicja typów dla danych oczekiwanych przez różne komendy
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
} // gameManager.Ship jest już poprawne
interface AttackData {
  gameId: number;
  x: number;
  y: number;
  indexPlayer: number;
}

// Funkcja do obsługi tury bota (wywoływana przez serwer)
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
  let attackResultDetailsFromSwitch:
    | gameManager.AttackResultDetails
    | undefined = undefined;
  let shouldSendUpdateRoom = false;

  // Parsowanie danych tylko raz, jeśli istnieją
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
          shouldSendUpdateRoom = true; // Po zalogowaniu wyślij też listę pokoi
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
          responseType = 'create_room'; // Odpowiedź na create_room, ale z błędem
        } else {
          const newRoom = roomManager.createRoom(
            client.playerId,
            client.playerName,
            client
          );
          // Odpowiedź do klienta tworzącego pokój nie jest zdefiniowana w specyfikacji,
          // ale możemy wysłać potwierdzenie lub nic nie wysyłać bezpośrednio,
          // ponieważ update_room poinformuje o nowym pokoju.
          // responseData = { roomId: newRoom.id }; // Opcjonalnie
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
          // Stwórz wirtualnego gracza-bota
          // Używamy ujemnego ID, aby odróżnić od graczy ludzkich
          const botPlayerId = -1; // Stałe ID dla bota w grze 1vBot
          const botPlayer = {
            playerId: botPlayerId,
            playerName: 'Bot',
            isBot: true,
          };

          // Utwórz nową grę z graczem ludzkim i botem
          // gameManager.createNewGame oczekuje teraz GamePlayer, nie RoomUser
          const humanPlayerForGame = {
            playerId: client.playerId,
            playerName: client.playerName,
            ws: client,
          };
          const gameId = roomManager.getNextGameId(); // Użyj funkcji z roomManager do pobrania unikalnego ID gry
          const newGame = gameManager.createNewGame(
            gameId,
            humanPlayerForGame,
            botPlayer
          );

          console.log(
            `[MessageHandler] Game ${gameId} created for single player mode.`
          );
          // Bot rozmieszcza statki
          const botShips = bot.placeBotShips();
          gameManager.addShipsToGame(gameId, botPlayerId, botShips);

          console.log(
            `[MessageHandler] Bot ships placed and added to game ${gameId}.`
          );
          // Gracz ludzki musi jeszcze rozmieścić statki (komenda add_ships)
          // Wyślij wiadomość create_game do gracza ludzkiego
          sendMessageToClient(client, 'create_game', {
            idGame: newGame.gameId,
            // W grze 1vBot, gracz ludzki jest zawsze pierwszy (index 0) lub drugi (index 1)
            // i jego gamePlayerId (1 lub 2) jest determinowane przez jego pozycję w tablicy.
            // gameManager.createNewGame losuje, kto zaczyna (currentPlayerIndex),
            // ale idPlayer w create_game powinno być stałe dla gracza ludzkiego w tej grze.
            // Załóżmy, że gracz ludzki to player1Input w createNewGame, więc jego gamePlayerId to 1.
            // Lub, jeśli bot jest zawsze player2Input, to gamePlayerId gracza ludzkiego to 1.
            // Dla uproszczenia, przypiszmy graczowi ludzkiemu idPlayer = 1 w grze z botem.
            idPlayer: 1, // Gracz ludzki w grze z botem
          });
          console.log(
            `[MessageHandler] Created single player game ${newGame.gameId} for player ${client.playerName} (ID: ${client.playerId}) vs Bot.`
          );
          // Gra przejdzie do statusu 'playing' i wyśle start_game/turn po tym, jak gracz ludzki doda statki
        }
        break;
      }

      case 'add_user_to_room': {
        if (client.playerId === undefined || client.playerName === undefined) {
          responseData = {
            error: true,
            errorText: 'Player not registered/logged in',
          };
          responseType = 'add_user_to_room'; // Odpowiedź na add_user_to_room, ale z błędem
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
          // Upewnij się, że gracz wysyłający statki to ten sam gracz (indexPlayer)
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
            } // Jeśli sukces, odpowiedź zostanie wysłana w bloku 'start_game' poniżej
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
          // Wiadomość 'attack' z wynikiem strzału zostanie wysłana poniżej, jeśli nie ma błędu
          // i zostanie obsłużona poniżej, poza blokiem switch, jeśli nie ma błędu.
          // Tutaj tylko przygotowujemy dane, jeśli atak był udany.
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
        // Dla randomAttack, 'data' może nie być potrzebne lub może zawierać tylko gameId i indexPlayer
        // Załóżmy, że klient wysyła {"gameId": X, "indexPlayer": Y}
        if (!data) {
          throw new Error(
            'Data for "randomAttack" command is missing (expected gameId, indexPlayer).'
          );
        }
        const { gameId, indexPlayer } = JSON.parse(data) as Omit<
          AttackData,
          'x' | 'y'
        >; // Omit x, y

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
          // Wiadomość 'attack' z wynikiem strzału zostanie wysłana poniżej, jeśli nie ma błędu (wspólny blok)
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
        `[MessageHandler] Sent response for command ${responseType}, ID: ${id}, Response Data: ${JSON.stringify(responseData)}`
      );
    }

    // Sprawdź, czy pokój jest pełny po dodaniu gracza i wyślij create_game
    if (
      type === 'add_user_to_room' &&
      responseType !== 'error' &&
      responseData?.error !== true
    ) {
      if (!data) return; // Już obsłużone, ale dla pewności
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
        // Utwórz grę w gameManager
        // Mapuj RoomUser na GamePlayerInput
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
        roomManager.removeRoom(room.id); // Usuń pokój z listy dostępnych
        shouldSendUpdateRoom = true; // Upewnij się, że update_room zostanie wysłany
      }
    }

    // Sprawdź, czy gra może się rozpocząć po dodaniu statków
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
              // Upewnij się, że board istnieje
              sendMessageToClient(player.ws, 'start_game', {
                ships: player.board.ships, // Pozycje własnych statków
                currentPlayerIndex:
                  game.currentPlayerIndex === playerGameIndex
                    ? player.playerId
                    : game.players[game.currentPlayerIndex].playerId, // ID gracza, który zaczyna
              });
              sendMessageToClient(player.ws, 'turn', {
                currentPlayer: game.players[game.currentPlayerIndex].playerId,
              });
              console.log(
                `[MessageHandler] Sent start_game and turn to player ${player.playerName} (ID: ${player.playerId})`
              );
              // Jeśli po wysłaniu start_game i turn, aktualnym graczem jest bot, wywołaj jego turę
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
        // Gra się rozpoczęła, nie ma potrzeby wysyłać update_room, bo pokój już został usunięty
      }
    }

    // Handle turn and finish messages after attack or randomAttack
    // Ten blok jest teraz kluczowy dla wysyłania aktualizacji po udanym ataku (zwykłym lub losowym)
    if (
      (type === 'attack' || type === 'randomAttack') &&
      !responseData?.error
    ) {
      // Użyj attackResultDetailsFromSwitch, które zostało ustawione w bloku switch dla 'attack'/'randomAttack'
      if (
        attackResultDetailsFromSwitch &&
        !attackResultDetailsFromSwitch.error
      ) {
        const game = gameManager.getGameById(
          attackResultDetailsFromSwitch.gameId
        );
        if (!game) {
          // To nie powinno się zdarzyć, jeśli attackResultDetailsFromSwitch jest poprawne
          console.error(
            `[MessageHandler] Game not found for ID ${attackResultDetailsFromSwitch.gameId} after successful attack.`
          );
          return;
        }

        // Wyślij wiadomość 'attack' z wynikiem do obu graczy
        const attackMessagePayload: any = {
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

        // Logika 'finish' lub 'turn'
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

          // Jeśli po zmianie tury (lub kontynuacji) jest tura bota, wywołaj logikę bota
          const currentPlayer = game.players[game.currentPlayerIndex];
          if (currentPlayer.isBot) {
            console.log(
              `[MessageHandler] It's Bot's turn in game ${game.gameId}. Triggering bot move.`
            );
            // Użyj setImmediate, aby uniknąć blokowania pętli zdarzeń
            setImmediate(() => {
              handleBotTurn(game.gameId, currentPlayer.playerId, wss);
            });
          }
        }
      } // koniec if (attackResultDetailsFromSwitch && !attackResultDetailsFromSwitch.error)
    }

    // Nowa funkcja do obsługi tury bota
    async function handleBotTurn(
      gameId: number,
      botPlayerId: number,
      wss: WebSocketServer
    ) {
      // Ta funkcja jest wywoływana asynchronicznie (przez setImmediate)
      // Logika ataku bota i wysyłania wiadomości jest taka sama jak dla gracza ludzkiego,
      // ale koordynaty są generowane przez bota.
      // Możemy po prostu wywołać logikę randomAttack (która teraz używa bot.makeBotShot)
      // i następnie ponownie wywołać logikę wysyłania wiadomości turn/finish.
      // Ponieważ randomAttack już zwraca AttackResultDetails, możemy jej użyć.

      const game = gameManager.getGameById(gameId);
      // if (!game || game.status === 'pending_ships' || game.status === 'finished') {
      if (
        !game ||
        game.status === 'pending_ships' ||
        game.status === 'finished'
      ) {
        console.warn(
          `[MessageHandler] Bot turn attempted for game ${gameId} but game not found or not playing.`
        );
        return; // Gra już nie istnieje lub nie jest aktywna
      }

      // Sprawdź, czy to na pewno tura tego bota
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

      if (botAttackResultDetails.error) {
        console.error(
          `[MessageHandler] Bot attack failed in game ${gameId}: ${botAttackResultDetails.error}`
        );
        // Co zrobić w przypadku błędu bota? Zakończyć grę? Przekazać turę? Na razie logujemy.
        // Można by tu dodać logikę przekazania tury, jeśli bot nie może strzelić.
        // game.currentPlayerIndex = 1 - game.players.findIndex(p => p.playerId === botPlayerId);
        // const turnPayload = { currentPlayer: game.players[game.currentPlayerIndex].playerId };
        // game.players.forEach(p => { if (p.ws) sendMessageToClient(p.ws, 'turn', turnPayload); });
        return;
      }

      // Logika wysyłania wiadomości 'attack', 'turn', 'finish' po ataku bota
      // Jest taka sama jak dla gracza ludzkiego, więc możemy ją wywołać.
      // WAŻNE: game.status mógł zostać zmieniony przez handleRandomAttack.
      // Używamy rzutowania typu, aby TypeScript wiedział, że sprawdzamy ponownie pełny zakres statusów.
      const currentStatusAfterAttack =
        game.status as gameManager.Game['status'];

      // Wiadomość 'attack' (od bota) do gracza ludzkiego
      const attackMessagePayload: any = {
        position: {
          x: botAttackResultDetails.coordinates.x,
          y: botAttackResultDetails.coordinates.y,
        },
        currentPlayer: botAttackResultDetails.attackingPlayerId, // ID bota
        status: botAttackResultDetails.result,
      };
      if (botAttackResultDetails.shipKilled) {
        // This check is fine
        attackMessagePayload.ship = botAttackResultDetails.shipKilled;
      }
      // Wysyłamy tylko do gracza ludzkiego (bot nie ma ws)
      const humanPlayer = game.players.find((p) => !p.isBot);
      if (humanPlayer?.ws) {
        sendMessageToClient(humanPlayer.ws, 'attack', attackMessagePayload);
        console.log(
          `[MessageHandler] Sent 'attack' from Bot for game ${gameId}: ${JSON.stringify(attackMessagePayload)}`
        );
      }

      // Logika 'finish' lub 'turn' po ataku bota
      if (
        currentStatusAfterAttack === 'finished' &&
        game.winner !== undefined
      ) {
        const winnerId = game.winner;
        const finishPayload = { winPlayer: winnerId };
        // Wysyłamy tylko do gracza ludzkiego
        if (humanPlayer?.ws) {
          sendMessageToClient(humanPlayer.ws, 'finish', finishPayload);
          console.log(
            `[MessageHandler] Sent 'finish' from Bot for game ${game.gameId}: ${JSON.stringify(finishPayload)}`
          );
        }
        // Jeśli bot wygrał, dodaj zwycięstwo do jego "konta" (jeśli chcemy śledzić)
        // playerStore.incrementWins(winnerId); // Jeśli bot ma wpis w playerStore
        shouldSendUpdateWinners = true; // Trigger broadcast do wszystkich
        gameManager.removeGame(game.gameId);
      } else if (currentStatusAfterAttack === 'playing') {
        const turnPayload = {
          currentPlayer: game.players[game.currentPlayerIndex].playerId,
        };
        // Wysyłamy tylko do gracza ludzkiego
        if (humanPlayer?.ws) {
          sendMessageToClient(humanPlayer.ws, 'turn', turnPayload);
          console.log(
            `[MessageHandler] Sent 'turn' after Bot move for game ${game.gameId}: ${JSON.stringify(turnPayload)}`
          );
        }
        // Jeśli bot trafił, jego tura trwa - wywołaj handleBotTurn ponownie
        if (!botAttackResultDetails.turnChanged) {
          // turnChanged === false oznacza, że tura NIE zmieniła się (bot trafił)
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
      // Trigger broadcast update_winners jeśli flaga została ustawiona w bloku finish
      if (shouldSendUpdateWinners) {
        sendUpdateWinners(wss);
        console.log(
          '[MessageHandler] Triggered update_winners broadcast after bot game.'
        );
        shouldSendUpdateWinners = false; // Reset flag
      }
    }

    if (shouldSendUpdateRoom) {
      sendUpdateRoom(wss);
      console.log('[MessageHandler] Triggered update_room broadcast.');
      shouldSendUpdateRoom = false; // Reset flag
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
