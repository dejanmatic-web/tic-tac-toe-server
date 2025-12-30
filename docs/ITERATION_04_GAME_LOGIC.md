# Iteration 4: Game Logic Implementation

This iteration covers implementing the game move logic, winner detection, and match result reporting.

---

## Step 1: Add Helper Functions

Add these helper functions to `src/server.ts` before the Socket.IO Connection Handler section:

```typescript
// ============================================================================
// Helper Functions
// ============================================================================

function checkWinner(board: string[][]): string | null {
  // Check rows
  for (let i = 0; i < 3; i++) {
    if (board[i][0] && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
      return board[i][0];
    }
  }

  // Check columns
  for (let i = 0; i < 3; i++) {
    if (board[0][i] && board[0][i] === board[1][i] && board[1][i] === board[2][i]) {
      return board[0][i];
    }
  }

  // Check diagonals
  if (board[0][0] && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
    return board[0][0];
  }
  if (board[0][2] && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
    return board[0][2];
  }

  return null;
}

function isBoardFull(board: string[][]): boolean {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[i][j] === '') {
        return false;
      }
    }
  }
  return true;
}
```

---

## Step 2: Implement Make Move Handler

Add the `make_move` event handler inside the `io.on('connection')` block, after the `authenticate` handler and before the `disconnect` handler:

```typescript
  // --------------------------------------------------------------------------
  // Event: make_move
  // Player makes a move
  // --------------------------------------------------------------------------
  socket.on('make_move', async (data: { row: number; col: number }) => {
    if (!currentMatchId || !currentPlayer) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const match = activeMatches.get(currentMatchId);
    if (!match || match.status !== 'playing') {
      socket.emit('error', { message: 'Match not in playing state' });
      return;
    }

    // Check if it's player's turn
    if (match.currentPlayer !== currentPlayer.symbol) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // Ensure row and col are numbers (client might send strings)
    const row = Number(data.row);
    const col = Number(data.col);

    // Validate move bounds
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      socket.emit('error', { message: 'Invalid move coordinates' });
      return;
    }

    // Validate cell is empty
    if (match.board[row][col] !== '') {
      socket.emit('error', { message: 'Cell already occupied' });
      return;
    }

    // Make move
    match.board[row][col] = currentPlayer.symbol!;

    // Check for winner
    const winner = checkWinner(match.board);
    if (winner) {
      match.status = 'finished';
      match.winner = winner;
      match.currentPlayer = winner as 'X' | 'O';

      // Report match result to platform
      try {
        const winnerPlayer = Array.from(match.players.values()).find(
          p => p.symbol === winner
        );
        const loserPlayer = Array.from(match.players.values()).find(
          p => p.symbol !== winner
        );

        await gameSDK.reportMatchResult(currentMatchId, {
          players: [
            {
              id: parseInt(winnerPlayer!.id, 10),  // SDK expects number
              score: 1,
              isWinner: true,
            },
            {
              id: parseInt(loserPlayer!.id, 10),   // SDK expects number
              score: 0,
              isWinner: false,
            },
          ],
        });

        console.log(`✅ Match ${currentMatchId} finished. Winner: ${winnerPlayer!.username}`);
      } catch (error: any) {
        console.error('❌ Failed to report match result:', error.message);
      }

      // Notify players
      io.to(currentMatchId).emit('game_finished', {
        winner: match.winner,
        board: match.board,
      });

      // Clean up after delay (keep match data for 1 minute for any late requests)
      const matchIdToCleanup = currentMatchId;
      setTimeout(() => {
        if (matchIdToCleanup) {
          activeMatches.delete(matchIdToCleanup);
        }
      }, 60000);

    } else if (isBoardFull(match.board)) {
      // Draw - no winner but board is full
      match.status = 'finished';

      try {
        const playersArray = Array.from(match.players.values());
        await gameSDK.reportMatchResult(currentMatchId, {
          players: playersArray.map(p => ({
            id: parseInt(p.id, 10),  // SDK expects number
            score: 0,
            isWinner: false,
          })),
        });
        console.log(`✅ Match ${currentMatchId} finished as a draw`);
      } catch (error: any) {
        console.error('❌ Failed to report match result:', error.message);
      }

      io.to(currentMatchId).emit('game_finished', {
        winner: null,  // null indicates draw
        board: match.board,
      });

      const matchIdToCleanup = currentMatchId;
      setTimeout(() => {
        if (matchIdToCleanup) {
          activeMatches.delete(matchIdToCleanup);
        }
      }, 60000);

    } else {
      // Game continues - switch turn
      match.currentPlayer = match.currentPlayer === 'X' ? 'O' : 'X';

      // Broadcast move to all players in the match room
      io.to(currentMatchId).emit('move_made', {
        row: row,
        col: col,
        symbol: currentPlayer.symbol,
        currentPlayer: match.currentPlayer,
        board: match.board,
      });
    }
  });
```

---

## Step 3: Complete Server File Structure

Your `src/server.ts` should now have this structure:

```typescript
// 1. Imports
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { GameSDK } from '@gamerstake/game-platform-sdk';
import dotenv from 'dotenv';
import { GamePlayer, GameMatch } from './game/types';

dotenv.config();

// 2. Configuration
const PORT = process.env.PORT || 3000;
// ... other config

// 3. SDK Initialization
const gameSDK = new GameSDK({ ... });

// 4. Express & Socket.IO Setup
const app = express();
// ... health endpoint

// 5. Game State Management
const activeMatches = new Map<string, GameMatch>();
function createMatch(matchId: string): GameMatch { ... }

// 6. Helper Functions
function checkWinner(board: string[][]): string | null { ... }
function isBoardFull(board: string[][]): boolean { ... }

// 7. Socket.IO Connection Handler
io.on('connection', (socket: Socket) => {
  // authenticate event handler
  // make_move event handler
  // disconnect event handler
});

// 8. Start Server
httpServer.listen(PORT, () => { ... });
```

---

## Move Validation Summary

| Validation | Error Message |
|------------|---------------|
| Not authenticated | "Not authenticated" |
| Match not found or finished | "Match not in playing state" |
| Not player's turn | "Not your turn" |
| Invalid coordinates (< 0 or > 2) | "Invalid move coordinates" |
| Cell already occupied | "Cell already occupied" |

---

## Win Conditions

The `checkWinner` function checks all 8 possible winning combinations:

```
Rows:           Columns:        Diagonals:
[X][X][X]       [X][ ][ ]       [X][ ][ ]    [ ][ ][X]
[ ][ ][ ]       [X][ ][ ]       [ ][X][ ]    [ ][X][ ]
[ ][ ][ ]       [X][ ][ ]       [ ][ ][X]    [X][ ][ ]
```

---

## SDK Result Reporting

When reporting results to the platform:

```typescript
// Winner/Loser
await gameSDK.reportMatchResult(matchId, {
  players: [
    { id: winnerId, score: 1, isWinner: true },
    { id: loserId, score: 0, isWinner: false },
  ],
});

// Draw
await gameSDK.reportMatchResult(matchId, {
  players: [
    { id: player1Id, score: 0, isWinner: false },
    { id: player2Id, score: 0, isWinner: false },
  ],
});
```

**Important:** Player IDs must be converted to numbers using `parseInt(id, 10)` as the SDK expects numeric IDs.

---

## Verification

After completing this iteration, you should have:
- ✅ Move validation logic (bounds, turn, cell occupancy)
- ✅ Winner detection (rows, columns, diagonals)
- ✅ Draw detection (board full, no winner)
- ✅ Turn switching
- ✅ Match result reporting to SDK
- ✅ Game finished notifications
- ✅ Match cleanup after 1 minute

**Socket.io Events Implemented:**
- `make_move` (client → server): `{ row, col }`
- `move_made` (server → client): `{ row, col, symbol, currentPlayer, board }`
- `game_finished` (server → client): `{ winner, board }`
- `error` (server → client): `{ message }`

**Next:** Proceed to [Iteration 5: Deployment Preparation](./ITERATION_05_DEPLOYMENT.md)
