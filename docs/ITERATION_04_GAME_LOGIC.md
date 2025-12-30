# Iteration 4: Game Logic Implementation

This iteration covers implementing the game move logic, winner detection, and match result reporting.

---

## Step 1: Add Helper Functions

Add these helper functions to `src/server.ts` before the "Start Server" section:

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

    // Validate move
    if (match.board[data.row][data.col] !== '') {
      socket.emit('error', { message: 'Cell already occupied' });
      return;
    }

    // Make move
    match.board[data.row][data.col] = currentPlayer.symbol!;

    // Check for winner
    const winner = checkWinner(match.board);
    if (winner) {
      match.status = 'finished';
      match.winner = winner;
      match.currentPlayer = winner as 'X' | 'O';

      // Report match result
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
              id: winnerPlayer!.id,
              score: 1,
              isWinner: true,
            },
            {
              id: loserPlayer!.id,
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

      // Clean up after delay
      setTimeout(() => {
        activeMatches.delete(currentMatchId);
      }, 60000); // Keep match data for 1 minute
    } else if (isBoardFull(match.board)) {
      // Draw
      match.status = 'finished';

      try {
        const playersArray = Array.from(match.players.values());
        await gameSDK.reportMatchResult(currentMatchId, {
          players: playersArray.map(p => ({
            id: p.id,
            score: 0,
            isWinner: false,
          })),
        });
      } catch (error: any) {
        console.error('❌ Failed to report match result:', error.message);
      }

      io.to(currentMatchId).emit('game_finished', {
        winner: null,
        board: match.board,
      });

      setTimeout(() => {
        activeMatches.delete(currentMatchId);
      }, 60000);
    } else {
      // Switch turn
      match.currentPlayer = match.currentPlayer === 'X' ? 'O' : 'X';

      // Broadcast move to all players
      io.to(currentMatchId).emit('move_made', {
        row: data.row,
        col: data.col,
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

1. Imports
2. Configuration
3. SDK Initialization
4. Express & Socket.IO Setup
5. Health Check Endpoint
6. Game State Management
7. Socket.IO Connection Handler
   - `authenticate` event
   - `make_move` event
   - `disconnect` event
8. Helper Functions
   - `createMatch`
   - `checkWinner`
   - `isBoardFull`
9. Start Server

---

## Verification

After completing this iteration, you should have:
- ✅ Move validation logic
- ✅ Winner detection (rows, columns, diagonals)
- ✅ Draw detection
- ✅ Turn switching
- ✅ Match result reporting to SDK
- ✅ Game finished notifications

**Socket.io Events Implemented:**
- `make_move` (client → server)
- `move_made` (server → client)
- `game_finished` (server → client)
- `error` (server → client)

**Game Logic Features:**
- ✅ 3x3 board validation
- ✅ Turn-based gameplay
- ✅ Win condition checking (8 possible wins)
- ✅ Draw detection
- ✅ Match cleanup after completion

**Next:** Proceed to [Iteration 5: Deployment Preparation](./ITERATION_05_DEPLOYMENT.md)

