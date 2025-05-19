export interface Player {
  id: number;
  name: string;
  password: string;
  wins: number;
}

const playersById = new Map<number, Player>();
const playersByName = new Map<string, Player>();
let nextPlayerId = 1;

export function registerOrLoginPlayer(
  name: string,
  password: string
): { player?: Player; error?: string; isNewPlayer?: boolean } {
  const existingPlayer = playersByName.get(name);

  if (existingPlayer) {
    if (existingPlayer.password === password) {
      return { player: existingPlayer, isNewPlayer: false };
    } else {
      return { error: 'Invalid password' };
    }
  } else {
    if (name.trim() === '' || password.trim() === '') {
      return { error: 'Username and password cannot be empty' };
    }
    const newPlayer: Player = {
      id: nextPlayerId++,
      name,
      password,
      wins: 0,
    };
    playersById.set(newPlayer.id, newPlayer);
    playersByName.set(newPlayer.name, newPlayer);
    console.log(
      `[PlayerStore] Registered new player: ${name} (ID: ${newPlayer.id})`
    );
    return { player: newPlayer, isNewPlayer: true };
  }
}

export function getPlayerById(id: number): Player | undefined {
  return playersById.get(id);
}

export function getWinnersList(): { name: string; wins: number }[] {
  const allPlayers = Array.from(playersById.values());

  allPlayers.sort((a, b) => b.wins - a.wins);
  return allPlayers.map(({ name, wins }) => ({ name, wins }));
}

export function incrementWins(playerId: number): boolean {
  const player = playersById.get(playerId);
  if (player) {
    player.wins += 1;
    console.log(
      `[PlayerStore] Incremented wins for player: ${player.name} (ID: ${player.id}). Total wins: ${player.wins}`
    );
    return true;
  }
  return false;
}

export function getAllPlayers(): Player[] {
  return Array.from(playersById.values());
}

export function resetPlayerStore() {
  playersById.clear();
  playersByName.clear();
  nextPlayerId = 1;
  console.log('[PlayerStore] Player store has been reset.');
}
