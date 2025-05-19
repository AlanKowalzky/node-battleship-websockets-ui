import WebSocket from 'ws';

export interface RoomUser {
  name: string;
  index: number;
  ws?: WebSocket;
  gameId?: number;
  gamePlayerId?: number;
}

export interface Room {
  id: number;
  users: RoomUser[];
  status: 'waiting' | 'ready' | 'playing' | 'finished';
  gameId?: number;
}

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

const rooms = new Map<number, Room>();
let nextRoomId = 1;
let nextGameId = 1;

export function createRoom(
  creatorPlayerId: number,
  creatorPlayerName: string,
  creatorWs: WebSocket
): Room {
  const newRoomId = nextRoomId++;
  const creator: RoomUser = {
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

  if (room.users.some((user) => user.index === userId)) {
    return { error: 'Player is already in this room' };
  }

  const newUser: RoomUser = {
    name: userName,
    index: userId,
    ws: userWs,
  };

  room.users.push(newUser);
  room.status = 'ready';

  console.log(
    `[RoomManager] Added player ${userName} (ID: ${userId}) to room ${roomId}`
  );

  const gameId = nextGameId++;
  room.gameId = gameId;
  room.users[0].gameId = gameId;
  room.users[0].gamePlayerId = 1;
  room.users[1].gameId = gameId;

  room.users[1].gamePlayerId = 2;

  return { room };
}

export function getAvailableRooms(): {
  roomId: number;
  roomUsers: { name: string; index: number }[];
}[] {
  const availableRooms = Array.from(rooms.values()).filter(
    (room) => room.status === 'waiting'
  );
  return availableRooms.map((room) => ({
    roomId: room.id,
    roomUsers: room.users.map((user) => ({
      name: user.name,
      index: user.index,
    })),
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

export function getAllRooms(): Room[] {
  return Array.from(rooms.values());
}

export function resetRoomManager() {
  rooms.clear();
  nextRoomId = 1;
  nextGameId = 1;
  console.log('[RoomManager] Room manager has been reset.');
}

export function getNextGameId(): number {
  return nextGameId++;
}

export function findRoomByPlayerId(playerId: number): Room | undefined {
  for (const room of rooms.values()) {
    if (room.users.some((user) => user.index === playerId)) {
      return room;
    }
  }
  return undefined;
}

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
        removeRoom(roomId);
      } else if (room.users.length === 1 && room.status !== 'waiting') {
        room.status = 'waiting';
      }
      return true;
    }
  }
  return false;
}
