import WebSocket from 'ws';

const SERVER_URL = 'ws://localhost:8181'; // Upewnij się, że port jest taki sam jak serwera

console.log(`Attempting to connect to WebSocket server at ${SERVER_URL}`);
const ws = new WebSocket(SERVER_URL);

ws.on('open', () => {
  console.log('TestClient: Successfully connected to WebSocket server!');

  // Przygotuj testową wiadomość
  const testMessage = {
    type: 'test_cmd_from_script',
    data: JSON.stringify({ info: 'Hello from automated test client' }),
    id: 777,
  };

  // Wyślij wiadomość do serwera
  ws.send(JSON.stringify(testMessage));
  console.log('TestClient: Sent message to server:', testMessage);
});

ws.on('message', (data) => {
  console.log('TestClient: Received message from server:', data.toString());

  // Tutaj możesz dodać asercje, jeśli używasz frameworka testowego
  // Na przykład, sprawdzić czy odpowiedź jest zgodna z oczekiwaniami

  // Po otrzymaniu odpowiedzi, rozłącz się
  console.log('TestClient: Closing connection after receiving response.');
  ws.close();
});

ws.on('close', (code, reason) => {
  console.log(
    `TestClient: Disconnected from WebSocket server. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`
  );
  // Zakończ proces testowy po rozłączeniu
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('TestClient: WebSocket Error:', error.message);
  // Zakończ proces testowy w przypadku błędu połączenia
  process.exit(1);
});

// Timeout na wypadek, gdyby serwer nie odpowiadał lub coś poszło nie tak
setTimeout(() => {
  if (
    ws.readyState !== WebSocket.CLOSED &&
    ws.readyState !== WebSocket.CLOSING
  ) {
    console.error(
      'TestClient: Timeout - closing connection due to no activity or stuck state.'
    );
    ws.terminate(); // Wymuś zamknięcie
    process.exit(1);
  }
}, 10000); // 10 sekund timeout
