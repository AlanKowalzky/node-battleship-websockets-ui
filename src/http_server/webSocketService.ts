import http from 'http';
import WebSocket from 'ws'; // Użyj TYLKO domyślnego importu. WebSocket to teraz klasa klienta.
import * as playerStore from '../playerStore'; // Importujemy nasz playerStore
// import { User, Room, Game } from './models'; // Na razie zakomentowane, dodamy później

// const users = new Map<WebSocket, User>(); // Na razie zakomentowane
// const rooms = new Map<string, Room>(); // Na razie zakomentowane
// const games = new Map<string, Game>(); // Na razie zakomentowane

interface ClientMessage {
  type: string;
  data: string; // JSON string
  id: number;
}

// Funkcja pomocnicza do wysyłania wiadomości do wszystkich połączonych klientów
function broadcastMessage(wss: WebSocket.Server, type: string, data: any, id: number = 0) {
  // Upewnij się, że pole 'data' jest stringiem JSON, jeśli 'data' nie jest już stringiem
  const dataPayload = typeof data === 'string' ? data : JSON.stringify(data);
  const message = JSON.stringify({ type, data: dataPayload, id });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function sendUpdateWinners(wss: WebSocket.Server) {
  broadcastMessage(wss, 'update_winners', playerStore.getWinnersList());
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
  wss.on('connection', (client: WebSocket) => {
    console.log('Client connected to WebSocket server');
    // Tutaj można dodać logikę inicjalizacji użytkownika, np. przypisanie ID
    // const newUser: User = { id: generateUniqueId(), ws };
    // users.set(ws, newUser);

    // Wyślij aktualną listę zwycięzców do nowo połączonego klienta
    // (lub do wszystkich, jeśli tak ma być zgodnie ze specyfikacją po każdym połączeniu)
    // Na razie, zgodnie ze schematem, update_winners jest po reg.

    console.log('[DEBUG] client object type:', typeof client, 'instanceof WebSocket:', client instanceof WebSocket);

    client.on('message', (message: string) => {
      try {
        // 1. Parsowanie przychodzących wiadomości JSON.
        const parsedMessage: ClientMessage = JSON.parse(message);
        
        // Logowanie otrzymanej komendy
        console.log(
          `[WebSocket] Received command: ${parsedMessage.type}, ID: ${parsedMessage.id}, Raw Data: ${parsedMessage.data}`
        );
        // Jeśli chcesz zobaczyć sparsowane dane z pola 'data' (zakładając, że to JSON string):
        // try { console.log('Parsed Data field:', JSON.parse(parsedMessage.data)); } catch { /* ignore if not json */ }


        let responseData: any;
        let responseType = parsedMessage.type;
        let broadcastAfterResponse = false;

        switch (parsedMessage.type) {
          case 'reg': {
            const { name, password } = JSON.parse(parsedMessage.data);
            const result = playerStore.registerOrLoginPlayer(name, password);

            if (result.error) {
              responseData = { name, index: -1, error: true, errorText: result.error };
            } else if (result.player) {
              responseData = { name: result.player.name, index: result.player.id, error: false, errorText: '' };
              // Po udanej rejestracji/logowaniu, wyślij update_winners do wszystkich
              broadcastAfterResponse = true;
            }
            break;
          }

          // TODO: Handle other message types (create_room, etc.)

          default:
            responseData = { message: `Received and processed command: ${parsedMessage.type}` };
            console.log(`[WebSocket] Unknown command type: ${parsedMessage.type}`);
            // Można też wysłać błąd do klienta
            // responseType = 'error';
            // responseData = { message: `Unknown command: ${parsedMessage.type}` };
            break;
        }

        // 2. Wysłanie odpowiedzi w formacie JSON.
        if (responseData) {
          const response = {
            type: responseType,
            // Jeśli frontend oczekuje, że pole 'data' będzie stringiem JSON,
            // musimy je zstringify'ować tutaj.
            // Jeśli responseData jest już stringiem (np. prostą wiadomością), to się nie zmieni.
            data: typeof responseData === 'string' ? responseData : JSON.stringify(responseData),
            id: parsedMessage.id,
          };
          client.send(JSON.stringify(response));
          // 3. Logowanie wyniku komendy (czyli wysłanej odpowiedzi).
          console.log(`[WebSocket] Sent response for command ${response.type}, ID: ${response.id}, Response Data: ${JSON.stringify(responseData)}`);
        }

        if (broadcastAfterResponse) {
          sendUpdateWinners(wss);
          console.log('[WebSocket] Broadcasted update_winners to all clients.');
        }

      } catch (error) {
        console.error('[WebSocket] Failed to parse message or handle request:', error);
        const errorResponse = {
          type: 'error',
          data: JSON.stringify({ message: 'Invalid message format' }),
          id: 0, // lub spróbuj odczytać ID jeśli to możliwe
        };
        client.send(JSON.stringify(errorResponse));
      }
    });

    client.on('close', () => {
      console.log('Client disconnected from WebSocket server');
      // users.delete(ws);
      // TODO: Handle user disconnection, e.g., remove from room, notify opponent
    });

    client.on('error', (error: Error) => {
      console.error('WebSocket error for a client:', error);
    });
  });

  return wss;
}

// Definicja typu WebSocketServer, aby uniknąć problemów z typowaniem, jeśli nie jest bezpośrednio importowany
// interface WebSocketServer extends WebSocketClient.Server {} // Już niepotrzebne
// Definicja typu WebSocket, aby uniknąć problemów z typowaniem
// interface WebSocket extends WebSocketClient {} // Już niepotrzebne
