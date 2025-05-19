import * as WS_NAMESPACE from 'ws';

import * as playerStore from '../playerStore.js';
import * as roomManager from '../roomManager.js';
import { ClientMessage } from '../types/websocket.js';
import * as gameManager from '../gameManager.js';
import { sendMessageToClient, broadcastMessage } from './messageSender.js';
import { handleWebSocketMessage } from './messageHandler.js';

declare module 'ws' {
  interface WebSocket {
    playerId?: number;
    playerName?: string;
  }
}

export async function createWebSocketServer(
  port: number
): Promise<WS_NAMESPACE.WebSocketServer> {
  console.log(`WebSocket server is trying to start on port ${port}.`);

  let ServerClassToUse: typeof WS_NAMESPACE.WebSocketServer;
  if (
    typeof WS_NAMESPACE.default === 'function' &&
    (WS_NAMESPACE.default as any).Server
  ) {
    ServerClassToUse = (WS_NAMESPACE.default as any).Server;
  } else if (typeof WS_NAMESPACE.WebSocketServer === 'function') {
    ServerClassToUse = WS_NAMESPACE.WebSocketServer;
  } else {
    throw new TypeError(
      "Cannot find WebSocketServer constructor in 'ws' module."
    );
  }
  const wss = new ServerClassToUse({ port });

  wss.on('error', (error: Error) => {
    console.error('WebSocket Server Error:', error);
  });

  console.log(`WebSocket server started and listening on port ${port}.`);
  console.log(`WebSocket is running on ws://localhost:${port}`);

  wss.on('connection', (client: WS_NAMESPACE.default) => {
    console.log(`Client connected to WebSocket server.`);

    console.log(
      '[DEBUG] client object type:',
      typeof client,
      'instanceof WebSocket:',
      client instanceof WS_NAMESPACE.default
    );

    client.on('message', (message: Buffer) => {
      let parsedMessage: ClientMessage | undefined;
      try {
        const messageString = message.toString();

        parsedMessage = JSON.parse(messageString);

        if (parsedMessage) {
          handleWebSocketMessage(client, parsedMessage, wss);
        } else {
          throw new Error('Parsed message is undefined after JSON.parse');
        }
      } catch (error) {
        console.error(
          '[WebSocket] Failed to parse message or handle request:',
          error
        );
        const errorResponse = {
          type: 'error',
          data: { message: 'Invalid message format or error processing' },
          id: parsedMessage?.id || 0,
        };
        sendMessageToClient(
          client,
          'error',
          errorResponse.data,
          errorResponse.id
        );
      }
    });

    client.on('close', () => {
      console.log(
        `Client disconnected: ${client.playerName} (ID: ${client.playerId})`
      );
      if (client.playerId !== undefined) {
        const activeGame = gameManager.findGameByPlayerId(client.playerId);
        if (activeGame && activeGame.status === 'playing') {
          console.log(
            `[WebSocket/index] Player ${client.playerName} (ID: ${client.playerId}) disconnected during game ${activeGame.gameId}.`
          );
          const opponent = activeGame.players.find(
            (p) => p.playerId !== client.playerId
          );
          if (opponent && opponent.playerId !== undefined) {
            activeGame.status = 'finished';
            activeGame.winner = opponent.playerId;
            console.log(
              `[WebSocket/index] Game ${activeGame.gameId} finished. Winner due to disconnect: ${opponent.playerName} (ID: ${opponent.playerId})`
            );

            const finishPayload = { winPlayer: opponent.playerId };

            if (
              opponent.ws &&
              opponent.ws.readyState === WS_NAMESPACE.default.OPEN
            ) {
              sendMessageToClient(opponent.ws, 'finish', finishPayload);
            }

            playerStore.incrementWins(opponent.playerId);
            sendUpdateWinners(wss);
          }
          gameManager.removeGame(activeGame.gameId);
        }

        const roomPlayerWasIn = roomManager.findRoomByPlayerId(client.playerId);
        if (roomPlayerWasIn) {
          roomManager.removePlayerFromRoom(roomPlayerWasIn.id, client.playerId);
          sendUpdateRoom(wss);
        }
      }
    });

    client.on('error', (error: Error) => {
      console.error(
        `WebSocket error for client ${client.playerName || 'Unknown'} (ID: ${client.playerId || 'N/A'}):`,
        error
      );
    });
  });

  return wss;
}

export function sendUpdateRoom(wss: WS_NAMESPACE.WebSocketServer) {
  broadcastMessage(wss, 'update_room', roomManager.getAvailableRooms());
  console.log('[WebSocket/index] Broadcasted update_room.');
}

export function sendUpdateWinners(wss: WS_NAMESPACE.WebSocketServer) {
  broadcastMessage(wss, 'update_winners', playerStore.getWinnersList());
  console.log('[WebSocket/index] Broadcasted update_winners.');
}
