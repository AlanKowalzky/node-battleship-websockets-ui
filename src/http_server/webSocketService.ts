import http from 'http';
// import { User, Room, Game } from './models'; // Na razie zakomentowane, dodamy później

// const users = new Map<WebSocket, User>(); // Na razie zakomentowane
// const rooms = new Map<string, Room>(); // Na razie zakomentowane
// const games = new Map<string, Game>(); // Na razie zakomentowane

interface ClientMessage {
  type: string;
  data: string; // JSON string
  id: number;
}

export async function createWebSocketServer(
  httpServer: http.Server
): Promise<any> {
  const WebSocket = (await import('ws')).default;
  const wss = new WebSocket.Server({ server: httpServer });

  console.log(`WebSocket server started and attached to HTTP server.`);
  // Wyświetlenie parametrów WebSocket - port jest taki sam jak HTTP server
  const address = httpServer.address();
  if (address && typeof address !== 'string') {
    console.log(`WebSocket is running on ws://localhost:${address.port}`);
  }

  wss.on('connection', (ws: any) => {
    console.log('Client connected to WebSocket server');
    // Tutaj można dodać logikę inicjalizacji użytkownika, np. przypisanie ID
    // const newUser: User = { id: generateUniqueId(), ws };
    // users.set(ws, newUser);

    ws.on('message', (message: string) => {
      try {
        const parsedMessage: ClientMessage = JSON.parse(message);
        console.log(
          'Received command:',
          parsedMessage.type,
          'Data:',
          parsedMessage.data
        );

        // TODO: Handle different message types (reg, create_room, etc.)
        // Na razie tylko logujemy i odsyłamy potwierdzenie
        const response = {
          type: parsedMessage.type,
          data: JSON.stringify({
            message: `Received your command: ${parsedMessage.type}`,
          }),
          id: parsedMessage.id,
        };
        ws.send(JSON.stringify(response));
        console.log('Sent response:', response.type, 'Data:', response.data);
      } catch (error) {
        console.error('Failed to parse message or handle request:', error);
        const errorResponse = {
          type: 'error',
          data: JSON.stringify({ message: 'Invalid message format' }),
          id: 0, // lub spróbuj odczytać ID jeśli to możliwe
        };
        ws.send(JSON.stringify(errorResponse));
      }
    });

    ws.on('close', () => {
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
