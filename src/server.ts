import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { GameSDK } from '@gamerstake/game-platform-sdk';
import dotenv from 'dotenv';
import { GamePlayer, GameMatch } from './game/types';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 3000;
const GAMERSTAKE_API_KEY = process.env.GAMERSTAKE_API_KEY!;
const ENVIRONMENT = (process.env.ENVIRONMENT || 'development') as 'development' | 'production' | 'staging';
const DEBUG = process.env.DEBUG === 'true';

// ============================================================================
// Initialize SDK
// ============================================================================

const gameSDK = new GameSDK({
  apiKey: GAMERSTAKE_API_KEY,
  environment: ENVIRONMENT,
  debug: DEBUG && ENVIRONMENT !== 'production',
});

if (!gameSDK.isInitialized()) {
  console.error('❌ Failed to initialize GameSDK');
  process.exit(1);
}

console.log('✅ GameSDK initialized successfully');

// ============================================================================
// Express & Socket.IO Setup
// ============================================================================

const app = express();
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    sdk: gameSDK.isInitialized(),
    environment: ENVIRONMENT
  });
});

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

      // Step 6: Join match room FIRST (so player receives room events)
      socket.join(matchId);

      // Step 7: Check if we have 2 players - assign symbols
      let matchStarting = false;
      if (match.players.size === 2 && match.status === 'waiting') {
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

      // Step 9: THEN emit match_started to room (after authenticated)
      // Small delay to allow client to process authenticated event first
      if (matchStarting) {
        setTimeout(() => {
          const playersArray = Array.from(match.players.values());
          io.to(matchId).emit('match_started', {
            matchId,
            players: playersArray.map(p => ({
              id: p.id,
              username: p.username,
              symbol: p.symbol,
            })),
            currentPlayer: 'X',
          });
        }, 100);
      }

      // Step 10: Send current game state to newly joined player if match is in progress
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

    // Ensure row and col are numbers
    const row = Number(data.row);
    const col = Number(data.col);

    // Validate move bounds
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      socket.emit('error', { message: 'Invalid move coordinates' });
      return;
    }

    // Validate move
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
              id: parseInt(winnerPlayer!.id, 10),
              score: 1,
              isWinner: true,
            },
            {
              id: parseInt(loserPlayer!.id, 10),
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
      const matchIdToCleanup = currentMatchId;
      setTimeout(() => {
        if (matchIdToCleanup) {
          activeMatches.delete(matchIdToCleanup);
        }
      }, 60000); // Keep match data for 1 minute
    } else if (isBoardFull(match.board)) {
      // Draw
      match.status = 'finished';

      try {
        const playersArray = Array.from(match.players.values());
        await gameSDK.reportMatchResult(currentMatchId, {
          players: playersArray.map(p => ({
            id: parseInt(p.id, 10),
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

      const matchIdToCleanup2 = currentMatchId;
      setTimeout(() => {
        if (matchIdToCleanup2) {
          activeMatches.delete(matchIdToCleanup2);
        }
      }, 60000);
    } else {
      // Switch turn
      match.currentPlayer = match.currentPlayer === 'X' ? 'O' : 'X';

      // Broadcast move to all players
      io.to(currentMatchId).emit('move_made', {
        row: row,
        col: col,
        symbol: currentPlayer.symbol,
        currentPlayer: match.currentPlayer,
        board: match.board,
      });
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

// ============================================================================
// Start Server
// ============================================================================

httpServer.listen(PORT, () => {
  console.log(`🚀 Tic-Tac-Toe game server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready`);
  console.log(`🌍 Environment: ${ENVIRONMENT}`);
});

