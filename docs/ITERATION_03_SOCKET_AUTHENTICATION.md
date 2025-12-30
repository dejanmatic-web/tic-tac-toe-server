# Iteration 3: Socket.io Authentication Handler

This iteration covers implementing the Socket.io connection handler, authentication logic, and player reconnection support.

---

## Step 1: Add Game State Management

Add to `src/server.ts` after the Express & Socket.IO Setup section:

```typescript
// ============================================================================
// Game State Management
// ============================================================================

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

      // Step 3: Get or create game player (preserve symbol if reconnecting)
      const playerId = String(playerIdentity.id);
      let player = match.players.get(playerId);
      let isReconnect = false;

      if (player) {
        // Player reconnecting - update socket but keep symbol
        console.log(`🔄 Player ${playerId} reconnecting (existing symbol: ${player.symbol})`);
        player.socket = socket;
        isReconnect = true;
      } else {
        // New player joining
        player = {
          id: playerId,
          username: playerIdentity.username,
          socket: socket,
          symbol: null, // Will be assigned when match starts
        };
        match.players.set(player.id, player);
      }

      currentPlayer = player;
      currentMatchId = matchId;

      // Step 4: Report match start if this is the first player
      if (match.players.size === 1 && match.status === 'waiting' && !match.startedAt) {
        try {
          await gameSDK.reportMatchStart(matchId);
          match.startedAt = new Date();
          console.log(`✅ Match ${matchId} started`);
        } catch (error: any) {
          // SDK might complain about previous match - log but continue
          console.error('❌ Failed to report match start:', error.message);
          // Don't block the game - SDK reporting is not critical for gameplay
          match.startedAt = new Date(); // Mark as started anyway
        }
      }

      // Step 5: Report player join (only for new players, not reconnects)
      if (!isReconnect) {
        try {
          await gameSDK.reportPlayerJoin(matchId, player.id);
          console.log(`✅ Player ${player.id} joined match ${matchId}`);
        } catch (error: any) {
          // Log but don't block - SDK reporting is not critical
          console.error('❌ Failed to report player join:', error.message);
        }
      }

      // Step 6: Join match room FIRST (so player receives room events)
      socket.join(matchId);

      // Step 7: Check if we have 2 players - assign symbols (only if not already playing)
      let matchStarting = false;
      if (match.players.size === 2 && match.status === 'waiting' && !isReconnect) {
        const playersArray = Array.from(match.players.values());
        playersArray[0].symbol = 'X';
        playersArray[1].symbol = 'O';
        match.currentPlayer = 'X';
        match.status = 'playing';
        matchStarting = true;
      }

      // Step 8: Notify player of successful authentication FIRST
      // (Client needs playerId before processing match_started)
      socket.emit('authenticated', {
        playerId: player.id,
        username: player.username,
        matchId: matchId,
        symbol: player.symbol,
        matchStatus: match.status,
      });

      // Step 9: THEN emit match_started to each player individually
      // Send each player their own symbol directly to avoid ID matching issues
      if (matchStarting) {
        setTimeout(() => {
          const playersArray = Array.from(match.players.values());
          const playersData = playersArray.map(p => ({
            id: p.id,
            username: p.username,
            symbol: p.symbol,
          }));

          // Emit to each player individually with their specific symbol
          playersArray.forEach(p => {
            console.log(`📣 Emitting match_started to ${p.username} (${p.id}) with yourSymbol: ${p.symbol}`);
            p.socket.emit('match_started', {
              matchId,
              players: playersData,
              currentPlayer: 'X',
              yourSymbol: p.symbol, // Direct symbol assignment - no ID matching needed
            });
          });
        }, 250); // Small delay to ensure auth is processed first
      }

      // Step 10: Send current game state to reconnecting players
      // (Only for reconnections - not for initial match start)
      if (match.status === 'playing' && !matchStarting) {
        console.log(`📤 Sending game_state to reconnecting player ${player.id} with yourSymbol: ${player.symbol}`);
        socket.emit('game_state', {
          board: match.board,
          currentPlayer: match.currentPlayer,
          players: Array.from(match.players.values()).map(p => ({
            id: p.id,
            username: p.username,
            symbol: p.symbol,
          })),
          yourSymbol: player.symbol, // Include for reconnecting players
        });
      }

    } catch (error: any) {
      console.error('❌ Authentication failed:', error.message);
      socket.emit('auth_error', { message: error.message });
      socket.disconnect();
    }
  });

  // Disconnect handler will be added in next section
});
```

---

## Step 3: Add Disconnect Handler

Add inside the `io.on('connection')` block, after the authenticate handler:

```typescript
  // --------------------------------------------------------------------------
  // Event: disconnect
  // Handle player disconnection with reconnection grace period
  // --------------------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);

    if (currentMatchId && currentPlayer) {
      const match = activeMatches.get(currentMatchId);
      if (match) {
        // DON'T delete player - keep their data for reconnection
        // Just mark their socket as null
        const player = match.players.get(currentPlayer.id);
        if (player) {
          player.socket = null as any; // Mark as disconnected
          console.log(`📴 Player ${player.id} (${player.username}) marked as disconnected, symbol: ${player.symbol}`);
        }

        // Notify other player (but don't cancel the match yet - allow reconnect)
        socket.to(currentMatchId).emit('player_disconnected', {
          playerId: currentPlayer.id,
          temporary: true, // Let client know this might be temporary
        });

        // Only clean up match after a timeout if player doesn't reconnect
        const disconnectMatchId = currentMatchId;
        const disconnectPlayerId = currentPlayer.id;

        setTimeout(() => {
          const matchCheck = activeMatches.get(disconnectMatchId!);
          if (matchCheck) {
            const playerCheck = matchCheck.players.get(disconnectPlayerId);
            // If player still has null socket after 30 seconds, they're really gone
            if (playerCheck && playerCheck.socket === null) {
              console.log(`⏰ Player ${disconnectPlayerId} didn't reconnect, removing from match`);
              matchCheck.players.delete(disconnectPlayerId);

              // Try to report error (may fail due to SDK state, but that's ok)
              if (matchCheck.status === 'playing') {
                gameSDK.reportMatchError(disconnectMatchId!, 'Player disconnected permanently')
                  .catch(() => {}); // Silently ignore SDK errors
              }

              // Clean up if no connected players
              const connectedPlayers = Array.from(matchCheck.players.values()).filter(p => p.socket !== null);
              if (connectedPlayers.length === 0) {
                activeMatches.delete(disconnectMatchId!);
                console.log(`🗑️ Match ${disconnectMatchId} cleaned up - no connected players`);
              }
            }
          }
        }, 30000); // 30 second grace period for reconnection
      }
    }
  });
```

---

## Understanding the Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Authentication Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Player connects with token + matchId                       │
│     ↓                                                       │
│  SDK validates token                                        │
│     ↓                                                       │
│  Check if player exists (reconnecting?)                     │
│     ↓                                                       │
│  If reconnecting: update socket, keep symbol                │
│  If new: create player record                               │
│     ↓                                                       │
│  Report match start (first player only)                     │
│     ↓                                                       │
│  Report player join (new players only)                      │
│     ↓                                                       │
│  Join socket room                                           │
│     ↓                                                       │
│  If 2 players + waiting: assign symbols, start game         │
│     ↓                                                       │
│  Emit 'authenticated' immediately                           │
│     ↓                                                       │
│  Emit 'match_started' with yourSymbol (after 250ms)         │
│  OR emit 'game_state' for reconnections                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Understanding the Disconnect Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   Disconnect Flow                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Socket disconnects                                         │
│     ↓                                                       │
│  Mark player socket as null (don't delete)                  │
│     ↓                                                       │
│  Emit 'player_disconnected' with temporary: true            │
│     ↓                                                       │
│  Start 30-second timer                                      │
│     ↓                                                       │
│  If player reconnects before timeout:                       │
│     - Timer finds socket != null                            │
│     - Player keeps their symbol                             │
│     - Game continues                                        │
│                                                             │
│  If player doesn't reconnect:                               │
│     - Remove player from match                              │
│     - Report error to SDK                                   │
│     - Clean up if no players left                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Verification

After completing this iteration, you should have:
- ✅ Socket.io connection handler implemented
- ✅ Authentication event handler with SDK validation
- ✅ Reconnection support (preserves player symbol)
- ✅ Match creation and management
- ✅ Symbol assignment when 2 players join
- ✅ Graceful disconnect with 30-second reconnection window

**Socket.io Events Implemented:**
- `authenticate` (client → server)
- `authenticated` (server → client)
- `auth_error` (server → client)
- `match_started` (server → client) - includes `yourSymbol`
- `game_state` (server → client) - includes `yourSymbol`
- `player_disconnected` (server → client) - includes `temporary` flag

**Next:** Proceed to [Iteration 4: Game Logic Implementation](./ITERATION_04_GAME_LOGIC.md)
