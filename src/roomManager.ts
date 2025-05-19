import WebSocket from 'ws'; // Importujemy WebSocket z biblioteki 'ws'

export interface RoomUser {
  name: string;
  index: number; // Globalny ID gracza z playerStore (playerId)
  ws?: WebSocket; // Referencja do połączenia WebSocket (opcjonalne, ale przydatne)
  gameId?: number; // ID gry, gdy gra się rozpocznie
  gamePlayerId?: number; // ID gracza w ramach danej gry (1 lub 2)
}

export interface Room {
  id: number;
  users: RoomUser[];
  status: 'waiting' | 'ready' | 'playing' | 'finished'; // waiting: 1 gracz, ready: 2 graczy, playing: gra trwa
  gameId?: number; // ID gry, gdy gra się rozpocznie
}

// Definicje typów dla danych wysyłanych do klienta
export interface ClientRoomUser {
  name: string;
  index: number;
  gameId?: number;
  gamePlayerId?: number;
}

export interface ClientRoom {
  id: number;
  users: ClientRoomUser[];
  status: 'waiting' | 'ready' | 'playing' | 'finished';
  gameId?: number;
}
// Map przechowująca aktywne pokoje
const rooms = new Map<number, Room>();
let nextRoomId = 1;
let nextGameId = 1; // Licznik dla ID gier

export function createRoom(
  creatorPlayerId: number,
  creatorPlayerName: string,
  creatorWs: WebSocket
): Room {
  const newRoomId = nextRoomId++;
  const creator: RoomUser = {
    // Upewnij się, że playerId jest poprawnie przekazywane i używane
    // Zgodnie z logiką w messageHandler, creatorPlayerId to client.playerId
    // a creatorPlayerName to client.playerName
    // index w RoomUser to globalne ID gracza
    name: creatorPlayerName,
    index: creatorPlayerId,
    ws: creatorWs,
  };

  const newRoom: Room = {
    id: newRoomId,
    users: [creator],
    status: 'waiting',
  };

  rooms.set(newRoomId, newRoom);
  console.log(
    `[RoomManager] Created new room: ${newRoomId} by player ${creatorPlayerName} (ID: ${creatorPlayerId})`
  );
  return newRoom;
}

export function addUserToRoom(
  roomId: number,
  userId: number,
  userName: string,
  userWs: WebSocket
): { room?: Room; error?: string } {
  const room = rooms.get(roomId);

  if (!room) {
    return { error: 'Room not found' };
  }

  if (room.users.length >= 2) {
    return { error: 'Room is already full' };
  }

  // Sprawdź, czy gracz nie jest już w tym pokoju (choć logika frontendu powinna to uniemożliwić)
  if (room.users.some((user) => user.index === userId)) {
    return { error: 'Player is already in this room' };
  }

  const newUser: RoomUser = {
    // Upewnij się, że userId jest poprawnie przekazywane i używane
    // Zgodnie z logiką w messageHandler, userId to client.playerId
    // a userName to client.playerName
    name: userName,
    index: userId,
    ws: userWs,
  };

  room.users.push(newUser);
  room.status = 'ready'; // Pokój gotowy do gry

  console.log(
    `[RoomManager] Added player ${userName} (ID: ${userId}) to room ${roomId}`
  );

  // Przypisz ID gry i ID graczy w grze
  // Ta logika powinna być wywołana tylko raz, gdy pokój staje się 'ready'
  const gameId = nextGameId++;
  room.gameId = gameId;
  room.users[0].gameId = gameId;
  room.users[0].gamePlayerId = 1; // Gracz 1 w tej grze
  room.users[1].gameId = gameId;
  // Upewnij się, że drugi gracz ma gamePlayerId = 2
  room.users[1].gamePlayerId = 2; // Gracz 2 w tej grze

  return { room };
}

export function getAvailableRooms(): {
  roomId: number;
  roomUsers: { name: string; index: number }[];
}[] {
  // Zwróć tylko pokoje ze statusem 'waiting' (1 gracz)
  const availableRooms = Array.from(rooms.values()).filter(
    (room) => room.status === 'waiting'
  );
  return availableRooms.map((room) => ({
    roomId: room.id, // Zgodnie ze specyfikacją: roomId
    roomUsers: room.users.map((user) => ({
      // Zgodnie ze specyfikacją: roomUsers
      name: user.name,
      index: user.index,
      // Usuwamy dodatkowe pola gameId i gamePlayerId, aby ściśle pasować do specyfikacji update_room
    })),
    // Usuwamy dodatkowe pola status i gameId z obiektu pokoju dla update_room
  }));
}

export function getRoomById(roomId: number): Room | undefined {
  return rooms.get(roomId);
}

export function removeRoom(roomId: number): boolean {
  const deleted = rooms.delete(roomId);
  if (deleted) {
    console.log(`[RoomManager] Removed room: ${roomId}`);
  }
  return deleted;
}

// Funkcja do debugowania (opcjonalna)
export function getAllRooms(): Room[] {
  return Array.from(rooms.values());
}

// Funkcja do resetowania stanu na potrzeby testów (opcjonalna)
export function resetRoomManager() {
  rooms.clear();
  nextRoomId = 1;
  nextGameId = 1;
  console.log('[RoomManager] Room manager has been reset.');
}

// Funkcja do pobierania następnego unikalnego ID gry
export function getNextGameId(): number {
  return nextGameId++;
}

// Nowa funkcja do znalezienia pokoju po ID gracza
export function findRoomByPlayerId(playerId: number): Room | undefined {
  for (const room of rooms.values()) {
    if (room.users.some((user) => user.index === playerId)) {
      return room;
    }
  }
  return undefined;
}

// Nowa funkcja do usunięcia gracza z pokoju
export function removePlayerFromRoom(
  roomId: number,
  playerId: number
): boolean {
  const room = rooms.get(roomId);
  if (room) {
    const playerIndex = room.users.findIndex((user) => user.index === playerId);
    if (playerIndex !== -1) {
      room.users.splice(playerIndex, 1);
      console.log(
        `[RoomManager] Removed player ${playerId} from room ${roomId}`
      );
      if (room.users.length === 0) {
        // Jeśli pokój jest pusty, usuń go
        removeRoom(roomId);
      } else if (room.users.length === 1 && room.status !== 'waiting') {
        // Jeśli był pełny, a teraz jest jeden gracz
        room.status = 'waiting'; // Zmień status na oczekujący
      }
      return true;
    }
  }
  return false;
}
