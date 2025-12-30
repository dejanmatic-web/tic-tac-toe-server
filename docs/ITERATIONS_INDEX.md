# Tic-Tac-Toe Game Server Development - Iterations Guide

This guide breaks down the Tic-Tac-Toe game server development into step-by-step iterations that can be completed in Cursor. Each iteration builds upon the previous one.

**Note:** Admin panel steps (creating the game, configuring server URL) are excluded from these iterations as they are done outside of Cursor.

---

## Iterations Overview

1. **[Iteration 1: Project Setup & Configuration](./ITERATION_01_PROJECT_SETUP.md)**
   - Initialize project
   - Install dependencies
   - Configure TypeScript
   - Set up environment files
   - Create project structure

2. **[Iteration 2: SDK Integration & Express Server](./ITERATION_02_SDK_INTEGRATION.md)**
   - Create TypeScript types
   - Initialize GamerStake SDK
   - Set up Express server
   - Configure Socket.IO with proper timeouts
   - Create health endpoint

3. **[Iteration 3: Socket.io Authentication Handler](./ITERATION_03_SOCKET_AUTHENTICATION.md)**
   - Implement Socket.io connection handler
   - Add player authentication with SDK
   - Handle player reconnection (preserve symbols)
   - Manage match creation and player joins
   - Handle disconnections with 30-second grace period

4. **[Iteration 4: Game Logic Implementation](./ITERATION_04_GAME_LOGIC.md)**
   - Implement move validation (bounds, turn, cell)
   - Add winner detection (8 win conditions)
   - Handle draw conditions
   - Report match results to SDK
   - Manage game state and cleanup

5. **[Iteration 5: Deployment Preparation](./ITERATION_05_DEPLOYMENT.md)**
   - Prepare build configuration
   - Create Railway deployment files
   - Test production build
   - Document deployment process

---

## Quick Start

Follow the iterations in order:

1. Start with [Iteration 1](./ITERATION_01_PROJECT_SETUP.md)
2. Complete each iteration before moving to the next
3. Test your code after each iteration
4. Proceed to deployment with [Iteration 5](./ITERATION_05_DEPLOYMENT.md)

---

## Prerequisites

Before starting, ensure you have:

- **Node.js 18+** installed
- **npm** or **yarn** package manager
- **GamerStake API Key** (obtained from admin panel)
- **Git** repository initialized (for deployment)

---

## What's Excluded

These iterations focus only on code development in Cursor. The following admin panel steps are **not included**:

- Creating the game in admin panel (Step 1 from main guide)
- Configuring game server URL in admin panel (Step 6 from main guide)
- Testing with the platform (requires admin access)

These steps should be completed separately in the admin panel.

---

## Key Features Implemented

| Feature | Description |
|---------|-------------|
| SDK Integration | Token validation, match reporting |
| Real-time Gameplay | Socket.io for instant updates |
| Reconnection Support | 30-second grace period, symbol preservation |
| Move Validation | Turn checking, bounds validation |
| Win/Draw Detection | 8 win conditions, full board check |
| Match Cleanup | Automatic cleanup after 1 minute |

---

## Socket.io Events Summary

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `authenticate` | `{ token, matchId }` | Authenticate player |
| `make_move` | `{ row, col }` | Make a move |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `authenticated` | `{ playerId, username, matchId, symbol, matchStatus }` | Auth successful |
| `auth_error` | `{ message }` | Auth failed |
| `match_started` | `{ matchId, players, currentPlayer, yourSymbol }` | Game begins |
| `game_state` | `{ board, currentPlayer, players, yourSymbol }` | Sync state |
| `move_made` | `{ row, col, symbol, currentPlayer, board }` | Move made |
| `game_finished` | `{ winner, board }` | Game ended |
| `player_disconnected` | `{ playerId, temporary }` | Player left |
| `error` | `{ message }` | General error |

---

## Testing

After completing all iterations, you can test locally:

```bash
# Start development server
npm run dev

# Test health endpoint
curl http://localhost:3000/health

# Test Socket.io connection (use a Socket.io client tool)
```

---

## Support

If you encounter issues:

- Check the troubleshooting section in each iteration
- Verify environment variables are set correctly
- Ensure all dependencies are installed
- Check that TypeScript compiles without errors

---

## Next Steps After Completion

1. **Deploy to Railway** (follow Iteration 5)
2. **Deploy Frontend** (follow client iterations)
3. **Configure Server URL** in admin panel
4. **Update CORS** with frontend URL
5. **Test End-to-End** with the platform
6. **Monitor Logs** for any issues

---

**Happy Coding!** 🎮
