export interface Player {
  id: number;
  name: string;
  password: string; // W rzeczywistej aplikacji hasła powinny być hashowane!
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
    // Gracz istnieje, próba logowania
    if (existingPlayer.password === password) {
      return { player: existingPlayer, isNewPlayer: false };
    } else {
      return { error: 'Invalid password' };
    }
  } else {
    // Nowy gracz, rejestracja
    if (name.trim() === '' || password.trim() === '') {
      return { error: 'Username and password cannot be empty' };
    }
    const newPlayer: Player = {
      id: nextPlayerId++,
      name,
      password, // Pamiętaj o hashowaniu w prawdziwej aplikacji
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
  // Sortuj malejąco według liczby zwycięstw
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

// Funkcja do debugowania (opcjonalna)
export function getAllPlayers(): Player[] {
  return Array.from(playersById.values());
}

// Funkcja do resetowania stanu na potrzeby testów (opcjonalna)
export function resetPlayerStore() {
  playersById.clear();
  playersByName.clear();
  nextPlayerId = 1;
  console.log('[PlayerStore] Player store has been reset.');
}
