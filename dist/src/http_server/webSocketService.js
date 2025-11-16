'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.createWebSocketServer = createWebSocketServer;
const ws_1 = __importDefault(require('ws'));
const WebSocketServer = ws_1.default.Server;
function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });
  console.log(`WebSocket server started and attached to HTTP server.`);

  const address = httpServer.address();
  if (address && typeof address !== 'string') {
    console.log(`WebSocket is running on ws://localhost:${address.port}`);
  }
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket server');

    ws.on('message', (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        console.log(
          'Received command:',
          parsedMessage.type,
          'Data:',
          parsedMessage.data
        );
        // TODO: Handle different message types (reg, create_room, etc.)

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
          id: 0,
        };
        ws.send(JSON.stringify(errorResponse));
      }
    });
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket server');

      // TODO: Handle user disconnection, e.g., remove from room, notify opponent
    });
    ws.on('error', (error) => {
      console.error('WebSocket error for a client:', error);
    });
  });
  return wss;
}
