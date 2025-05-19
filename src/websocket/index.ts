import * as WS_NAMESPACE from 'ws'; // Importuj wszystko jako WS_NAMESPACE
// import http from 'http'; // No longer needed for creating the WS server instance directly
import * as playerStore from '../playerStore.js'; // Importujemy nasz playerStore
import * as roomManager from '../roomManager.js'; // Importujemy roomManager
import { ClientMessage } from '../types/websocket.js'; // Importujemy nasz interfejs
import { sendMessageToClient, broadcastMessage } from './messageSender.js'; // Importujemy z messageSender
import { handleWebSocketMessage } from './messageHandler.js'; // Importujemy główny handler wiadomości

// Rozszerzenie typu WebSocket o niestandardowe właściwości
declare module 'ws' {
  interface WebSocket { // To powinno nadal działać, rozszerzając domyślny eksport
    playerId?: number;
    playerName?: string;
  }
}

export async function createWebSocketServer(port: number): Promise<WS_NAMESPACE.WebSocketServer> { // Użyjemy typu WebSocketServer z domyślnego eksportu
  console.log(`WebSocket server is trying to start on port ${port}.`);
  
  // Spróbuj uzyskać dostęp do WebSocketServer przez domyślny eksport
  // W module 'ws', klasa serwera jest często dostępna jako 'Server' na domyślnym eksporcie
  // lub jako 'WebSocketServer' na domyślnym eksporcie.
  // Jeśli WS_NAMESPACE to obiekt modułu, a default to główny eksport:
  // Sprawdźmy, czy WS_NAMESPACE.default jest konstruktorem (co jest typowe dla modułów CommonJS importowanych do ESM)
  // lub czy WS_NAMESPACE.WebSocketServer jest konstruktorem.
  let ServerClassToUse: typeof WS_NAMESPACE.WebSocketServer;
  if (typeof WS_NAMESPACE.default === 'function' && (WS_NAMESPACE.default as any).Server) { // Sprawdź, czy default.Server istnieje i jest funkcją
    ServerClassToUse = (WS_NAMESPACE.default as any).Server;
  } else if (typeof WS_NAMESPACE.WebSocketServer === 'function') {
    ServerClassToUse = WS_NAMESPACE.WebSocketServer;
  } else {
    throw new TypeError("Cannot find WebSocketServer constructor in 'ws' module.");
  }
  const wss = new ServerClassToUse({ port });

  // Add error handling for the server itself
  wss.on('error', (error: Error) => {
      console.error('WebSocket Server Error:', error);
      // Depending on the error, you might want to attempt a restart or just log
  });

  console.log(`WebSocket server started and listening on port ${port}.`);
  console.log(`WebSocket is running on ws://localhost:${port}`);

  // Typ klienta: WebSocket (domyślny import)
  wss.on('connection', (client: WS_NAMESPACE.default) => { // Użyj WS_NAMESPACE.default dla typu klienta
    console.log(`Client connected to WebSocket server.`); // Usunięto ID i Name, bo mogą być jeszcze nieustawione
    // Poprawka dla instanceof: użyj WS_NAMESPACE.default
    console.log('[DEBUG] client object type:', typeof client, 'instanceof WebSocket:', client instanceof WS_NAMESPACE.default);

    client.on('message', (message: Buffer) => {
      let parsedMessage: ClientMessage | undefined; // Zadeklaruj parsedMessage tutaj
      try {
        const messageString = message.toString();
        // console.log(`[WebSocket/index] Received raw message: ${messageString}`); // Można odkomentować do debugowania
        parsedMessage = JSON.parse(messageString); // Przypisz wartość w bloku try

        // Upewnij się, że parsedMessage nie jest undefined przed wywołaniem handleWebSocketMessage
        if (parsedMessage) {
          handleWebSocketMessage(client, parsedMessage, wss);
        } else {
          // To nie powinno się zdarzyć, jeśli JSON.parse rzuci błąd przy niepoprawnym JSON
          throw new Error("Parsed message is undefined after JSON.parse");
        }
      } catch (error) {
        console.error('[WebSocket] Failed to parse message or handle request:', error);
        const errorResponse = {
          type: 'error', // Typ błędu
          data: { message: 'Invalid message format or error processing' }, // data jako obiekt, sendMessageToClient to zstringifikuje
          id: parsedMessage?.id || 0, 
        };
        sendMessageToClient(client, 'error', errorResponse.data, errorResponse.id); // Użyj sendMessageToClient
      }
    });

    client.on('close', () => {
      console.log(`Client disconnected: ${client.playerName} (ID: ${client.playerId})`);
      // TODO: Obsługa rozłączenia użytkownika (Etap 7)
      // np. roomManager.handleDisconnect(client.playerId);
      // np. gameManager.handleDisconnect(client.playerId);
    });

    client.on('error', (error: Error) => {
      console.error(`WebSocket error for client ${client.playerName || 'Unknown'} (ID: ${client.playerId || 'N/A'}):`, error);
    });
  });

  return wss;
}

// Funkcje do wysyłania konkretnych typów wiadomości (pozostają tutaj, bo potrzebują wss)
export function sendUpdateRoom(wss: WS_NAMESPACE.WebSocketServer) {
  broadcastMessage(wss, 'update_room', roomManager.getAvailableRooms());
  console.log('[WebSocket/index] Broadcasted update_room.');
}

export function sendUpdateWinners(wss: WS_NAMESPACE.WebSocketServer) {
  broadcastMessage(wss, 'update_winners', playerStore.getWinnersList());
  console.log('[WebSocket/index] Broadcasted update_winners.');
}
