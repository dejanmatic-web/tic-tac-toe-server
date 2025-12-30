# Iteration 3: Socket.io Authentication Handler

This iteration covers implementing the Socket.io connection handler and authentication logic.

---

## Step 1: Add Game State Management

Add to `src/server.ts` after the Socket.IO setup section:

```typescript
// ============================================================================
// Game State Management
// ============================================================================

import { GamePlayer, GameMatch } from './game/types';

const activeMatches = new Map<string, GameMatch>();

function createMatch(matchId: string): GameMatch {
  return {
    id: matchId,
    players: new Map(),
    board: [
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ],
    currentPlayer: 'X',
    status: 'waiting',
    winner: null,
  };
}
```

---

## Step 2: Implement Socket.io Connection Handler

Add to `src/server.ts` after the game state management section:

```typescript
// ============================================================================
// Socket.IO Connection Handler
// ============================================================================

io.on('connection', (socket: Socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  let currentPlayer: GamePlayer | null = null;
  let currentMatchId: string | null = null;

  // --------------------------------------------------------------------------
  // Event: authenticate
  // Player sends their JWT token and match ID
  // --------------------------------------------------------------------------
  socket.on('authenticate', async (data: { token: string; matchId: string }) => {
    try {
      const { token, matchId } = data;

      console.log(`🔐 Authenticating player for match ${matchId}...`);

      // Step 1: Validate player token with platform
      const playerIdentity = await gameSDK.validatePlayerToken(token);

      console.log(`✅ Player authenticated: ${playerIdentity.username} (${playerIdentity.id})`);

      // Step 2: Get or create match
      let match = activeMatches.get(matchId);
      if (!match) {
        match = createMatch(matchId);
        activeMatches.set(matchId, match);
      }

      // Step 3: Create game player
      const player: GamePlayer = {
        id: playerIdentity.id,
        username: playerIdentity.username,
        socket: socket,
        symbol: null, // Will be assigned when match starts
      };

      match.players.set(player.id, player);
      currentPlayer = player;
      currentMatchId = matchId;

      // Step 4: Report match start if this is the first player
      if (match.players.size === 1 && match.status === 'waiting') {
        try {
          await gameSDK.reportMatchStart(matchId);
          match.startedAt = new Date();
          console.log(`✅ Match ${matchId} started`);
        } catch (error: any) {
          console.error('❌ Failed to report match start:', error.message);
          socket.emit('error', { message: 'Failed to start match' });
          return;
        }
      }

      // Step 5: Report player join
      try {
        await gameSDK.reportPlayerJoin(matchId, player.id);
        console.log(`✅ Player ${player.id} joined match ${matchId}`);
      } catch (error: any) {
        console.error('❌ Failed to report player join:', error.message);
      }

      // Step 6: Assign symbols and start game if we have 2 players
      if (match.players.size === 2 && match.status === 'waiting') {
        const playersArray = Array.from(match.players.values());
        playersArray[0].symbol = 'X';
        playersArray[1].symbol = 'O';
        match.currentPlayer = 'X';
        match.status = 'playing';

        // Notify both players
        io.to(matchId).emit('match_started', {
          matchId,
          players: playersArray.map(p => ({
            id: p.id,
            username: p.username,
            symbol: p.symbol,
          })),
          currentPlayer: 'X',
        });
      }

      // Step 7: Notify player of successful authentication
      socket.emit('authenticated', {
        playerId: player.id,
        username: player.username,
        matchId: matchId,
        symbol: player.symbol,
        matchStatus: match.status,
      });

      // Step 8: Join match room
      socket.join(matchId);

      // Step 9: Send current game state if match is in progress
      if (match.status === 'playing') {
        socket.emit('game_state', {
          board: match.board,
          currentPlayer: match.currentPlayer,
          players: Array.from(match.players.values()).map(p => ({
            id: p.id,
            username: p.username,
            symbol: p.symbol,
          })),
        });
      }

    } catch (error: any) {
      console.error('❌ Authentication failed:', error.message);
      socket.emit('auth_error', { message: error.message });
      socket.disconnect();
    }
  });

  // --------------------------------------------------------------------------
  // Event: disconnect
  // Handle player disconnection
  // --------------------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);

    if (currentMatchId && currentPlayer) {
      const match = activeMatches.get(currentMatchId);
      if (match) {
        match.players.delete(currentPlayer.id);

        // Report match error if game was in progress
        if (match.status === 'playing') {
          gameSDK.reportMatchError(currentMatchId, 'Player disconnected')
            .catch(err => console.error('Failed to report match error:', err));
        }

        // Notify other player
        socket.to(currentMatchId).emit('player_disconnected', {
          playerId: currentPlayer.id,
        });

        // Clean up match if no players left
        if (match.players.size === 0) {
          activeMatches.delete(currentMatchId);
        }
      }
    }
  });
});
```

---

## Step 3: Update Imports

Make sure your imports at the top of `src/server.ts` include:

```typescript
import { GamePlayer, GameMatch } from './game/types';
```

---

## Verification

After completing this iteration, you should have:
- ✅ Socket.io connection handler implemented
- ✅ Authentication event handler working
- ✅ Match creation and management
- ✅ Player join logic
- ✅ Disconnect handling
- ✅ SDK integration for match start and player join

**Socket.io Events Implemented:**
- `authenticate` (client → server)
- `authenticated` (server → client)
- `auth_error` (server → client)
- `match_started` (server → client)
- `game_state` (server → client)
- `player_disconnected` (server → client)

**Next:** Proceed to [Iteration 4: Game Logic Implementation](./ITERATION_04_GAME_LOGIC.md)

