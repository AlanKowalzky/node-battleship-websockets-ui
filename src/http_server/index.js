import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { createWebSocketServer } from './webSocketService.js';

export const httpServer = http.createServer(function (req, res) {
  // Sprawdź, czy to żądanie uaktualnienia do WebSocket.
  // Jeśli tak, nie rób nic tutaj - pozwól bibliotece 'ws' obsłużyć zdarzenie 'upgrade'.
  if (
    req.headers.upgrade &&
    req.headers.upgrade.toLowerCase() === 'websocket'
  ) {
    // Nie wysyłaj odpowiedzi, pozwól 'ws' przejąć.
    return;
  }

  const __dirname = path.resolve(path.dirname(''));
  const file_path =
    __dirname + (req.url === '/' ? '/front/index.html' : '/front' + req.url);
  fs.readFile(file_path, function (err, data) {
    if (err) {
      res.writeHead(404);
      res.end(JSON.stringify(err));
      return;
    }
    res.writeHead(200);
    res.end(data);
  });
});

// Utwórz i podłącz serwer WebSocket
createWebSocketServer(httpServer);
