import * as WS_NAMESPACE from 'ws';

// Funkcja pomocnicza do tworzenia stringu wiadomości WebSocket
function createFinalWebSocketMessage(type: string, rawData: any, id: number = 0): string {
  let dataFieldPayload: string;

  try {
    dataFieldPayload = JSON.stringify(rawData ?? null);
  } catch (e) {
    console.error("Error stringifying data for WebSocket message:", e, "Original data:", rawData);
    dataFieldPayload = JSON.stringify(null);
  }

  return JSON.stringify({
    type,
    data: dataFieldPayload,
    id,
  });
}

// Funkcja pomocnicza do wysyłania wiadomości do konkretnego klienta
export function sendMessageToClient(client: WS_NAMESPACE.default, type: string, data: any, id: number = 0) {
    const messageString = createFinalWebSocketMessage(type, data, id);
    if (client.readyState === WS_NAMESPACE.default.OPEN) {
        client.send(messageString);
    } else {
        console.warn(`[WebSocket/messageSender] Attempted to send message to client with ID ${client.playerId} but connection is not open. State: ${client.readyState}`);
    }
}

// Funkcja pomocnicza do wysyłania wiadomości do wszystkich połączonych klientów
export function broadcastMessage(wss: WS_NAMESPACE.WebSocketServer, type: string, data: any, id: number = 0) {
  const messageString = createFinalWebSocketMessage(type, data, id);
  wss.clients.forEach((client: WS_NAMESPACE.default) => {
    if (client.readyState === WS_NAMESPACE.default.OPEN) {
      client.send(messageString);
    }
  });
}