# Iteration 2: SDK Integration & Express Server

This iteration covers initializing the GamerStake SDK, setting up Express server, and creating the basic server structure.

---

## Step 1: Create Main Server File

Create `src/server.ts` with basic imports and configuration:

```typescript
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { GameSDK } from '@gamerstake/game-platform-sdk';
import dotenv from 'dotenv';

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
// Start Server
// ============================================================================

httpServer.listen(PORT, () => {
  console.log(`🚀 Tic-Tac-Toe game server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready`);
  console.log(`🌍 Environment: ${ENVIRONMENT}`);
});
```

---

## Step 2: Create Type Definitions

Create `src/game/types.ts`:

```typescript
import { Socket } from 'socket.io';

export interface GamePlayer {
  id: string;
  username: string;
  socket: Socket;
  symbol: 'X' | 'O' | null;
}

export interface GameMatch {
  id: string;
  players: Map<string, GamePlayer>;
  board: string[][];
  currentPlayer: 'X' | 'O';
  status: 'waiting' | 'playing' | 'finished';
  winner: string | null;
  startedAt?: Date;
}
```

---

## Step 3: Test the Server

Run the development server:

```bash
npm run dev
```

You should see:
```
✅ GameSDK initialized successfully
🚀 Tic-Tac-Toe game server running on port 3000
📡 Socket.IO server ready
🌍 Environment: development
```

Test the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "sdk": true,
  "environment": "development"
}
```

---

## Verification

After completing this iteration, you should have:
- ✅ SDK initialized successfully
- ✅ Express server running
- ✅ Socket.IO server configured
- ✅ Health endpoint working
- ✅ Type definitions created

**Next:** Proceed to [Iteration 3: Socket.io Authentication Handler](./ITERATION_03_SOCKET_AUTHENTICATION.md)

