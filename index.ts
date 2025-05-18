import { httpServer } from "./src/http_server/index.js"; // Upewnij się, że ścieżka jest poprawna
import { createWebSocketServer } from "./src/http_server/webSocketService.js"; // Upewnij się, że ścieżka jest poprawna
import type { WebSocketServer as WebSocketServerType, WebSocket } from 'ws'; // Import typów dla WebSocket

const HTTP_PORT = process.env.HTTP_PORT || 8181;

console.log(`Attempting to start HTTP server on port ${HTTP_PORT}...`);

let wssInstance: WebSocketServerType | null = null;

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  console.error('HTTP Server Error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Error: Port ${HTTP_PORT} is already in use. Please close the other application or choose a different port.`);
  }
  process.exit(1); // Zakończ, jeśli serwer HTTP nie może wystartować
});

httpServer.listen(HTTP_PORT, async () => {
  console.log(`HTTP server is listening on port ${HTTP_PORT}`);
  try {
    console.log('Initializing WebSocket server...');
    // createWebSocketServer jest teraz async, więc używamy await
    wssInstance = await createWebSocketServer(httpServer);
    console.log(`WebSocket server instance created: ${wssInstance ? 'yes' : 'no'}`);
  } catch (err) {
    console.error('Failed to initialize WebSocket server:', err);
    process.exit(1);
  }
});

function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  httpServer.close(() => {
    console.log('HTTP server closed.');
    if (wssInstance) {
      console.log('Closing WebSocket connections...');
      wssInstance.clients.forEach((client: WebSocket) => { // Dodano typ dla client
        if (client.readyState === client.OPEN) { // Użyj client.OPEN zamiast WebSocket.OPEN dla instancji klienta
          client.close();
        }
      });
      wssInstance.close(() => {
        console.log('WebSocket server closed.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  // Wymuś zamknięcie po timeout, jeśli coś pójdzie nie tak
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000); // 10 sekund timeout
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));