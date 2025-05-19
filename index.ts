import { httpServer } from "./src/http_server/index.js"; // Upewnij się, że ścieżka jest poprawna
import { createWebSocketServer } from "./src/websocket/index.js"; // Upewnij się, że ścieżka jest poprawna
import * as WS_NAMESPACE from 'ws'; // Importuj wszystko jako WS_NAMESPACE
import dotenv from 'dotenv';

// Załaduj zmienne środowiskowe z pliku .env
dotenv.config();
const FRONTEND_PORT = +(process.env.FRONTEND_PORT || 8181); // Konwertuj na liczbę
const WEBSOCKET_PORT = +(process.env.WEBSOCKET_PORT || 3000); // Konwertuj na liczbę

console.log(`Attempting to start HTTP server for frontend on port ${FRONTEND_PORT}...`);

let wssInstance: WS_NAMESPACE.WebSocketServer | null = null; // Użyjemy typu WebSocketServer z domyślnego eksportu

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  console.error('HTTP Server Error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Error: Port ${FRONTEND_PORT} for frontend is already in use. Please close the other application or choose a different port.`);
  }
  process.exit(1); // Zakończ, jeśli serwer HTTP nie może wystartować
});

httpServer.listen(FRONTEND_PORT, async () => {
  console.log(`HTTP server for frontend is listening on port ${FRONTEND_PORT}`);
  // Serwer WebSocket startuje niezależnie
});

// Inicjalizacja serwera WebSocket na osobnym porcie
async function startWebSocketServer() {
  try {
    console.log('Initializing WebSocket server...');
    wssInstance = await createWebSocketServer(WEBSOCKET_PORT); // Przekazujemy port zamiast serwera HTTP
    console.log(`WebSocket server instance created: ${wssInstance ? 'yes' : 'no'}`);
  } catch (err) {
    console.error('Failed to initialize WebSocket server:', err);
    process.exit(1);
  }
}

startWebSocketServer();

function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  httpServer.close(() => {
    console.log('HTTP server closed.');
    if (wssInstance) {
      console.log('Closing WebSocket connections...');
      wssInstance.clients.forEach((client: WS_NAMESPACE.default) => { // Użyj typu WS_NAMESPACE.default
        // Poprawka: Użyj WebSocket.OPEN do sprawdzania stanu połączenia
        if (client.readyState === WS_NAMESPACE.default.OPEN) { 
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