// c:\progNodeJS\node-battleship\src\types\ws.d.ts

import 'ws';

declare module 'ws' {
  interface WebSocket {
    playerId?: number;
    playerName?: string;
  }
}
