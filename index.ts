import http from 'http';
import { createWebSocketServer } from './src/http_server/webSocketService.js';

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World\n');
});

const PORT = process.env.PORT || 8181;

httpServer.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

// Inicjalizacja WebSocket servera
createWebSocketServer(httpServer).catch(error => {
  console.error('Failed to initialize WebSocket server:', error);
});
