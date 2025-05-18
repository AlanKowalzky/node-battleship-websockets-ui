import http from 'http'; // Dodaj brakujący import http
import ws from 'ws'; // Importuj cały moduł jako 'ws'
// import { User, Room, Game } from './models'; // Na razie zakomentowane, dodamy później

// const users = new Map<WebSocket, User>(); // Na razie zakomentowane
// const rooms = new Map<string, Room>(); // Na razie zakomentowane
// const games = new Map<string, Game>(); // Na razie zakomentowane

interface ClientMessage {
  type: string;
  data: string; // JSON string
  id: number;
}

export function createWebSocketServer( // Funkcja nie musi być async
  httpServer: http.Server
): WebSocketServer { // Zwraca instancję WebSocketServer
  const wss = new ws.WebSocketServer({ server: httpServer }); // Użyj WebSocketServer z zaimportowanego modułu 'ws'

  console.log(`WebSocket server started and attached to HTTP server.`);
  // Wyświetlenie parametrów WebSocket - port jest taki sam jak HTTP server
  const address = httpServer.address();
  if (address && typeof address !== 'string') {
    console.log(`WebSocket is running on ws://localhost:${address.port}`);
  }

  wss.on('connection', (client: ws.WebSocket) => { // Użyj typu ws.WebSocket dla klienta
    console.log('Client connected to WebSocket server');
    // Tutaj można dodać logikę inicjalizacji użytkownika, np. przypisanie ID
    // const newUser: User = { id: generateUniqueId(), ws };
    // users.set(ws, newUser);

    ws.on('message', (message: string) => {
      try {
        // 1. Parsowanie przychodzących wiadomości JSON.
        const parsedMessage: ClientMessage = JSON.parse(message);
        
        // Logowanie otrzymanej komendy
        console.log(
          `[WebSocket] Received command: ${parsedMessage.type}, ID: ${parsedMessage.id}, Raw Data: ${parsedMessage.data}`
        );
        // Jeśli chcesz zobaczyć sparsowane dane z pola 'data' (zakładając, że to JSON string):
        // try { console.log('Parsed Data field:', JSON.parse(parsedMessage.data)); } catch { /* ignore if not json */ }


        // TODO: Handle different message types (reg, create_room, etc.)
        // Na razie tylko logujemy i odsyłamy potwierdzenie
        const response = {
          type: parsedMessage.type,
          data: JSON.stringify({
            message: `Received your command: ${parsedMessage.type}`,
          }),
          id: parsedMessage.id,
        };

        // 2. Wysłanie odpowiedzi w formacie JSON.
        client.send(JSON.stringify(response));

        // 3. Logowanie wyniku komendy (czyli wysłanej odpowiedzi).
        console.log(`[WebSocket] Sent response for command ${response.type}, ID: ${response.id}, Response Data: ${response.data}`);
      } catch (error) {
        console.error('Failed to parse message or handle request:', error);
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

    ws.on('error', (error: Error) => {
      console.error('WebSocket error for a client:', error);
    });
  });

  return wss;
}

// Definicja typu WebSocketServer, aby uniknąć problemów z typowaniem, jeśli nie jest bezpośrednio importowany
interface WebSocketServer extends ws.Server {}
// Definicja typu WebSocket, aby uniknąć problemów z typowaniem
interface WebSocket extends ws.WebSocket {}
