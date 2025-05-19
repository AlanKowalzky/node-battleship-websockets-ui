// c:\progNodeJS\node-battleship\src\gameManager.test.ts

import {
    createNewGame,
    addShipsToGame,
    handleAttack,
    getGameById,
    resetGameManager, // Dodajemy reset, aby testy były niezależne
    Ship,
    Game,
  } from './gameManager'; // Upewnij się, że ścieżka jest poprawna
  
  // Mockowanie zależności, jeśli są potrzebne.
  // W tym przypadku handleAttack operuje głównie na wewnętrznym stanie gry,
  // więc nie potrzebujemy mockować playerStore, roomManager itp.
  // Jeśli w przyszłości handleAttack będzie wywoływać inne moduły, trzeba je będzie zamockować.
  
  describe('GameManager', () => {
    // Resetuj stan GameManager przed każdym testem, aby zapewnić czyste środowisko
    beforeEach(() => {
      resetGameManager();
    });
  
    test('should correctly handle consecutive hits on the same ship', () => {
      // 1. Ustawienie stanu gry
      const gameId = 1;
      const player1Id = 101;
      const player2Id = 102; // Ten gracz będzie się bronił
  
      // Tworzymy grę
      const game = createNewGame(
        gameId,
        { playerId: player1Id, playerName: 'Player1' },
        { playerId: player2Id, playerName: 'Player2' }
      );
  
      // Upewnij się, że gra została utworzona
      expect(game).toBeDefined();
      expect(getGameById(gameId)).toBe(game);
  
      // Ustawiamy gracza 1 jako aktualnego gracza, aby mógł strzelać
      game.currentPlayerIndex = game.players.findIndex(p => p.playerId === player1Id);
      expect(game.players[game.currentPlayerIndex].playerId).toBe(player1Id);
  
      // Dodajemy statki dla obu graczy
      // Gracz 1 (atakujący) może mieć puste statki dla uproszczenia testu ataku
      const player1Ships: Ship[] = [];
      addShipsToGame(gameId, player1Id, player1Ships);
  
      // Gracz 2 (broniący się) ma statek, w który będziemy strzelać
      const player2Ships: Ship[] = [
        { position: { x: 2, y: 3 }, direction: true, length: 3, type: 'medium' }, // Statek poziomy na (2,3), (3,3), (4,3)
        // Można dodać inne statki, aby plansza była bardziej realistyczna, ale jeden wystarczy do testu
      ];
      addShipsToGame(gameId, player2Id, player2Ships);
  
      // Sprawdź, czy gra przeszła w stan 'playing'
      expect(game.status).toBe('playing');
  
      // 2. Wykonanie pierwszego strzału (powinien być trafieniem)
      const firstShotCoords = { x: 2, y: 3 }; // Pierwszy segment statku
      const firstAttackResult = handleAttack(gameId, player1Id, firstShotCoords);
  
      // Sprawdź wynik pierwszego strzału
      expect(firstAttackResult.error).toBeUndefined();
      expect(firstAttackResult.result).toBe('shot'); // Powinno być trafienie
      expect(firstAttackResult.turnChanged).toBe(false); // Tura nie powinna się zmienić
      expect(firstAttackResult.nextPlayerId).toBe(player1Id); // Następny gracz to nadal gracz 1
  
      // Sprawdź stan planszy broniącego się gracza po pierwszym strzale
      const defendingPlayerBoardAfterFirstShot = getGameById(gameId)?.players.find(p => p.playerId === player2Id)?.board;
      expect(defendingPlayerBoardAfterFirstShot?.shotsReceived.length).toBe(1);
      expect(defendingPlayerBoardAfterFirstShot?.shotsReceived[0]).toEqual({ x: 2, y: 3, result: 'shot' });
  
      // Sprawdź, czy aktualny gracz nadal jest graczem 1
      expect(getGameById(gameId)?.players[getGameById(gameId)!.currentPlayerIndex].playerId).toBe(player1Id);
  
  
      // 3. Wykonanie drugiego strzału (powinien być trafieniem w kolejny segment)
      const secondShotCoords = { x: 3, y: 3 }; // Drugi segment tego samego statku
      const secondAttackResult = handleAttack(gameId, player1Id, secondShotCoords);
  
      // Sprawdź wynik drugiego strzału
      // *** TEN EXPECT SPRAWDZA PROBLEM, KTÓRY OPISAŁEŚ ***
      expect(secondAttackResult.error).toBeUndefined();
      expect(secondAttackResult.result).toBe('shot'); // Nadal powinno być trafienie
      expect(secondAttackResult.turnChanged).toBe(false); // Tura nadal nie powinna się zmienić
      expect(secondAttackResult.nextPlayerId).toBe(player1Id); // Następny gracz to nadal gracz 1
  
      // Sprawdź stan planszy broniącego się gracza po drugim strzale
      const defendingPlayerBoardAfterSecondShot = getGameById(gameId)?.players.find(p => p.playerId === player2Id)?.board;
      expect(defendingPlayerBoardAfterSecondShot?.shotsReceived.length).toBe(2);
      expect(defendingPlayerBoardAfterSecondShot?.shotsReceived).toContainEqual({ x: 2, y: 3, result: 'shot' });
      expect(defendingPlayerBoardAfterSecondShot?.shotsReceived).toContainEqual({ x: 3, y: 3, result: 'shot' });
  
       // Sprawdź, czy aktualny gracz nadal jest graczem 1
       expect(getGameById(gameId)?.players[getGameById(gameId)!.currentPlayerIndex].playerId).toBe(player1Id);
  
  
      // 4. Wykonanie trzeciego strzału (powinien zatopić statek)
      const thirdShotCoords = { x: 4, y: 3 }; // Trzeci (ostatni) segment tego samego statku
      const thirdAttackResult = handleAttack(gameId, player1Id, thirdShotCoords);
  
      // Sprawdź wynik trzeciego strzału
      expect(thirdAttackResult.error).toBeUndefined();
      expect(thirdAttackResult.result).toBe('killed'); // Powinno zatopić statek
      expect(thirdAttackResult.shipKilled).toBeDefined(); // Powinien zwrócić zatopiony statek
      expect(thirdAttackResult.shipKilled?.type).toBe('medium');
      expect(thirdAttackResult.turnChanged).toBe(false); // Tura nadal nie powinna się zmienić (przy zatopieniu też zostaje)
      expect(thirdAttackResult.nextPlayerId).toBe(player1Id); // Następny gracz to nadal gracz 1
  
      // Sprawdź stan planszy broniącego się gracza po trzecim strzale
      const defendingPlayerBoardAfterThirdShot = getGameById(gameId)?.players.find(p => p.playerId === player2Id)?.board;
      expect(defendingPlayerBoardAfterThirdShot?.shotsReceived.length).toBeGreaterThanOrEqual(3); // Powinno być co najmniej 3 strzały (trafienia)
      expect(defendingPlayerBoardAfterThirdShot?.shotsReceived).toContainEqual({ x: 2, y: 3, result: 'killed' }); // Status powinien być 'killed'
      expect(defendingPlayerBoardAfterThirdShot?.shotsReceived).toContainEqual({ x: 3, y: 3, result: 'killed' });
      expect(defendingPlayerBoardAfterThirdShot?.shotsReceived).toContainEqual({ x: 4, y: 3, result: 'killed' });
  
      // Sprawdź, czy gra się zakończyła i gracz 1 wygrał
      expect(getGameById(gameId)?.status).toBe('finished');
      expect(getGameById(gameId)?.winner).toBe(player1Id);
  
       // Sprawdź, czy aktualny gracz nadal jest graczem 1 (choć gra się skończyła)
       expect(getGameById(gameId)?.players[getGameById(gameId)!.currentPlayerIndex].playerId).toBe(player1Id);
  
    });
  
    // Możesz dodać więcej testów dla statków pionowych, różnych długości, strzałów wokół zatopionych statków itp.
    test('should correctly handle consecutive hits on a vertical ship', () => {
       // Ustawienie stanu gry podobnie jak wyżej, ale ze statkiem pionowym
       const gameId = 2;
       const player1Id = 103;
       const player2Id = 104;
  
       const game = createNewGame(
         gameId,
         { playerId: player1Id, playerName: 'Player3' },
         { playerId: player2Id, playerName: 'Player4' }
       );
  
       game.currentPlayerIndex = game.players.findIndex(p => p.playerId === player1Id);
  
       const player1Ships: Ship[] = [];
       addShipsToGame(gameId, player1Id, player1Ships);
  
       // Statek pionowy na (5,5), (5,6), (5,7)
       const player2Ships: Ship[] = [
         { position: { x: 5, y: 5 }, direction: false, length: 3, type: 'medium' },
       ];
       addShipsToGame(gameId, player2Id, player2Ships);
  
       expect(game.status).toBe('playing');
  
       // Pierwszy strzał (trafienie)
       const firstShotCoords = { x: 5, y: 5 }; // Górny segment
       const firstAttackResult = handleAttack(gameId, player1Id, firstShotCoords);
  
       expect(firstAttackResult.error).toBeUndefined();
       expect(firstAttackResult.result).toBe('shot');
       expect(firstAttackResult.turnChanged).toBe(false);
       expect(firstAttackResult.nextPlayerId).toBe(player1Id);
  
       // Drugi strzał (trafienie)
       const secondShotCoords = { x: 5, y: 6 }; // Środkowy segment
       const secondAttackResult = handleAttack(gameId, player1Id, secondShotCoords);
  
       // *** TEN EXPECT SPRAWDZA PROBLEM DLA STATKU PIONOWEGO ***
       expect(secondAttackResult.error).toBeUndefined();
       expect(secondAttackResult.result).toBe('shot'); // Powinno być trafienie
       expect(secondAttackResult.turnChanged).toBe(false);
       expect(secondAttackResult.nextPlayerId).toBe(player1Id);
  
       // Trzeci strzał (zatopienie)
       const thirdShotCoords = { x: 5, y: 7 }; // Dolny segment
       const thirdAttackResult = handleAttack(gameId, player1Id, thirdShotCoords);
  
       expect(thirdAttackResult.error).toBeUndefined();
       expect(thirdAttackResult.result).toBe('killed');
       expect(thirdAttackResult.shipKilled).toBeDefined();
       expect(thirdAttackResult.shipKilled?.type).toBe('medium');
       expect(thirdAttackResult.turnChanged).toBe(false);
       expect(thirdAttackResult.nextPlayerId).toBe(player1Id);
  
       expect(getGameById(gameId)?.status).toBe('finished');
       expect(getGameById(gameId)?.winner).toBe(player1Id);
    });
  
  });
  