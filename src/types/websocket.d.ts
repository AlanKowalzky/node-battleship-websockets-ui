// c:\progNodeJS\node-battleship\src\types\websocket.d.ts
import 'ws';

declare module 'ws' {
  interface WebSocket {
    playerId?: number;
    playerName?: string;
  }
}
export interface ClientMessage {
  type: string;
  data: string; // JSON string
  id: number;
}
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: any };
