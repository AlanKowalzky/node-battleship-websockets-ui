import http from 'http';
import WebSocket from 'ws'; // Użyj TYLKO domyślnego importu. WebSocket to teraz klasa klienta.
import * as playerStore from '../playerStore'; // Importujemy nasz playerStore
import * as roomManager from '../roomManager'; // Importujemy roomManager
import { ClientMessage } from '../types/websocket'; // Importujemy nasz interfejs
import { handleWebSocketMessage } from './messageHandler'; // Importujemy główny handler wiadomości

// Funkcja pomocnicza do wysyłania wiadomości do konkretnego klienta
export function sendMessageToClient(client: WebSocket, type: string, data: any, id: number = 0) {
    client.send(JSON.stringify({ type, data: typeof data === 'string' ? data : JSON.stringify(data), id }));
}

// Funkcja pomocnicza do wysyłania wiadomości do wszystkich połączonych klientów
export function broadcastMessage(wss: WebSocket.Server, type: string, data: any, id: number = 0) {
  // Upewnij się, że pole 'data' jest stringiem JSON, jeśli 'data' nie jest już stringiem
  const dataPayload = typeof data === 'string' ? data : JSON.stringify(data);
  const message = JSON.stringify({ type, data: dataPayload, id });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function sendUpdateRoom(wss: WebSocket.Server) {
  broadcastMessage(wss, 'update_room', roomManager.getAvailableRooms());
  console.log('[WebSocket/index] Broadcasted update_room.');
}

export function sendUpdateWinners(wss: WebSocket.Server) {
  broadcastMessage(wss, 'update_winners', playerStore.getWinnersList());
  console.log('[WebSocket/index] Broadcasted update_winners.');
}

export function createWebSocketServer( // Funkcja nie musi być async
  httpServer: http.Server
): WebSocket.Server { // Typ serwera to WebSocket.Server (statyczna właściwość/typ z klasy klienta)
  const wss = new WebSocket.Server({ server: httpServer }); // Konstruktor serwera to WebSocket.Server

  console.log(`WebSocket server started and attached to HTTP server.`);
  // Wyświetlenie parametrów WebSocket - port jest taki sam jak HTTP server
  const address = httpServer.address();
  if (address && typeof address !== 'string') {
    console.log(`WebSocket is running on ws://localhost:${address.port}`);
  }

  // Typ klienta: WebSocket (domyślny import)
  wss.on('connection', (client: WebSocket) => { // client jest typu WebSocket z modułu 'ws'
    console.log('Client connected to WebSocket server');

    console.log('[DEBUG] client object type:', typeof client, 'instanceof WebSocket:', client instanceof WebSocket);

    client.on('message', (message: string) => {
      try {
        const parsedMessage: ClientMessage = JSON.parse(message);
        // Delegowanie do głównego handlera wiadomości
        handleWebSocketMessage(client, parsedMessage, wss);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message or handle request:', error);
        const errorResponse = {
          type: 'error',
          data: JSON.stringify({ message: 'Invalid message format' }),
          id: 0, 
        };
        client.send(JSON.stringify(errorResponse));
      }
    });

    client.on('close', () => {
      console.log(`Client disconnected: ${client.playerName} (ID: ${client.playerId})`);
      // TODO: Handle user disconnection, e.g., remove from room, notify opponent
    });

    client.on('error', (error: Error) => {
      console.error('WebSocket error for a client:', error);
    });
  });

  return wss;
}
