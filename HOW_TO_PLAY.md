# How to Play Tic-Tac-Toe

This guide explains how to play the Tic-Tac-Toe game using the Socket.io server.

## Overview

The Tic-Tac-Toe game server is a **multiplayer** game that requires:
1. A **client application** (frontend) to connect to the server
2. **JWT token and Match ID** from the GamerStake platform
3. **Two players** to play a match

## Game Flow

### 1. **Get JWT Token and Match ID**

To play the game, you need:
- **JWT Token**: Obtained when a player joins a match through the GamerStake platform
- **Match ID**: The unique identifier for the match

These are typically provided by the GamerStake platform when:
- A player joins a lobby
- Matchmaking creates a match
- The platform redirects players to your game server

### 2. **Connect to the Server**

The client connects to the Socket.io server using:
```javascript
const socket = io('http://localhost:3000'); // or your deployed URL
```

### 3. **Authenticate**

Send authentication with token and match ID:
```javascript
socket.emit('authenticate', {
  token: 'your-jwt-token',
  matchId: 'match-id-123'
});
```

### 4. **Wait for Match Start**

When 2 players authenticate:
- Server assigns symbols: First player gets 'X', second gets 'O'
- Server emits `match_started` event
- Game begins!

### 5. **Make Moves**

Players take turns making moves:
```javascript
socket.emit('make_move', {
  row: 0,  // 0-2
  col: 1   // 0-2
});
```

### 6. **Receive Updates**

The server broadcasts game state:
- `move_made`: When a move is made
- `game_finished`: When game ends (winner or draw)
- `game_state`: Current board state

## Socket.io Events

### Client → Server Events

| Event | Data | Description |
|-------|------|-------------|
| `authenticate` | `{ token: string, matchId: string }` | Authenticate with platform |
| `make_move` | `{ row: number, col: number }` | Make a move (0-2 for row/col) |

### Server → Client Events

| Event | Data | Description |
|-------|------|-------------|
| `authenticated` | `{ playerId, username, matchId, symbol, matchStatus }` | Authentication successful |
| `auth_error` | `{ message: string }` | Authentication failed |
| `match_started` | `{ matchId, players, currentPlayer }` | Match has started with 2 players |
| `game_state` | `{ board, currentPlayer, players }` | Current game state |
| `move_made` | `{ row, col, symbol, currentPlayer, board }` | Move was made |
| `game_finished` | `{ winner: string \| null, board }` | Game ended |
| `player_disconnected` | `{ playerId }` | Other player disconnected |
| `error` | `{ message: string }` | General error |

## Testing the Game

### Option 1: Use the Test Client

I've created a simple HTML test client at `public/index.html`. To use it:

1. **Start the server:**
   ```bash
   cd tic-tac-toe-server
   npm run dev
   ```

2. **Open the test client:**
   - Navigate to `http://localhost:3000` in your browser
   - Or open `public/index.html` directly

3. **Enter credentials:**
   - Server URL: `http://localhost:3000`
   - JWT Token: Your token from the platform
   - Match ID: Your match ID

4. **Play:**
   - Click cells to make moves
   - Wait for your turn
   - See game updates in real-time

### Option 2: Use Socket.io Client Library

Create your own client using the Socket.io client library:

```html
<script src="https://cdn.socket.io/4.8.3/socket.io.min.js"></script>
<script>
  const socket = io('http://localhost:3000');

  socket.on('connect', () => {
    socket.emit('authenticate', {
      token: 'your-token',
      matchId: 'your-match-id'
    });
  });

  socket.on('match_started', (data) => {
    console.log('Match started!', data);
  });

  socket.on('move_made', (data) => {
    console.log('Move made:', data);
    // Update your UI
  });

  // Make a move
  function makeMove(row, col) {
    socket.emit('make_move', { row, col });
  }
</script>
```

### Option 3: Test with Two Browser Windows

1. Open the test client in two browser windows/tabs
2. Use the same match ID but different JWT tokens (from two different players)
3. Play against yourself!

## Integration with GamerStake Platform

The game is designed to work with the GamerStake platform:

1. **Player joins lobby** → Platform creates match
2. **Platform redirects** → Player sent to your game server URL
3. **Game server receives** → JWT token and match ID in URL params or via redirect
4. **Client connects** → Socket.io connection established
5. **Client authenticates** → Uses token and match ID
6. **Game plays** → Real-time gameplay via Socket.io
7. **Game ends** → Server reports results to platform
8. **Platform handles** → Payouts, leaderboards, etc.

## Example Game Session

```
1. Player 1 connects → Authenticates → Waits
2. Player 2 connects → Authenticates → Match starts!
3. Player 1 (X) makes move → (0, 0)
4. Player 2 (O) makes move → (1, 1)
5. Player 1 (X) makes move → (0, 1)
6. Player 2 (O) makes move → (2, 2)
7. Player 1 (X) makes move → (0, 2)
8. Game finished → X wins! (row 0)
9. Server reports result → Platform handles payout
```

## Troubleshooting

### "Cannot GET /"
- ✅ Fixed! The server now has a root endpoint that serves the test client

### "Authentication failed"
- Check your JWT token is valid
- Ensure match ID is correct
- Verify API key in `.env` matches your game's API key

### "Not your turn"
- Wait for the other player to make their move
- Check the `currentPlayer` in game state

### "Cell already occupied"
- The cell has already been played
- Update your UI to show occupied cells

### Connection issues
- Verify server is running: `curl http://localhost:3000/health`
- Check CORS settings if connecting from different domain
- Ensure Socket.io client version is compatible (4.x)

## Next Steps

1. **Deploy your server** to Railway (see `docs/ITERATION_05_DEPLOYMENT.md`)
2. **Create a proper frontend** client application
3. **Integrate with GamerStake platform** for full matchmaking flow
4. **Test end-to-end** with real players

Happy gaming! 🎮



