import 'ws';

declare module 'ws' {
  interface WebSocket {
    playerId?: number;
    playerName?: string;
  }
}
