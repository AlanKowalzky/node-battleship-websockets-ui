import WebSocket from 'ws';

const SERVER_URL = 'ws://localhost:8181';
let testStage = 'INITIALIZING';

function log(message: string) {
  console.log(`[TestClient - ${testStage}] ${message}`);
}

log(`Attempting to connect to WebSocket server at ${SERVER_URL}`);
testStage = 'CONNECTING';
const ws = new WebSocket(SERVER_URL);

let connectionTimer = setTimeout(() => {
  log('ERROR: Connection attempt timed out after 10 seconds.');
  if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CLOSED) {
    ws.terminate(); // Wymuś zamknięcie, jeśli utknęło
  }
  process.exit(1);
}, 10000); // 10 sekund na połączenie

ws.on('open', () => {
  clearTimeout(connectionTimer); // Anuluj timeout połączenia
  testStage = 'CONNECTED';
  log('Successfully connected to WebSocket server!');

  const testMessage = {
    type: 'ping',
    data: JSON.stringify({ timestamp: Date.now() }),
    id: 1,
  };

  log(`Sending message: ${JSON.stringify(testMessage)}`);
  testStage = 'SENDING_MESSAGE';
  ws.send(JSON.stringify(testMessage));
});

ws.on('message', (data: WebSocket.Data) => {
  testStage = 'MESSAGE_RECEIVED';
  log(`Received message from server: ${data.toString()}`);
  // Tutaj można by dodać logikę sprawdzania odpowiedzi
  log('Test completed successfully. Closing connection.');
  ws.close(1000, 'Test finished');
});

ws.on('close', (code: number, reason: Buffer) => {
  clearTimeout(connectionTimer); // Na wszelki wypadek, gdyby 'close' przyszło przed 'open' (np. błąd serwera)
  testStage = 'DISCONNECTED';
  log(`Disconnected. Code: ${code}, Reason: ${reason.toString()}`);
  process.exit(code === 1000 ? 0 : 1); // Zakończ z kodem 0 jeśli zamknięcie było normalne
});

ws.on('error', (error: Error) => {
  clearTimeout(connectionTimer);
  testStage = 'ERROR';
  log(`WebSocket Error: ${error.message}`);
  process.exit(1);
});