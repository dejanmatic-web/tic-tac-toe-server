# Iteration 5: Deployment Preparation

This iteration covers preparing the project for deployment to Railway, including build configuration and deployment files.

---

## Step 1: Create Railway Configuration

Create `railway.json` in the root directory:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Step 2: Create Procfile

Create `Procfile` in the root directory:

```
web: npm start
```

---

## Step 3: Create README.md

Create `README.md` in the root directory:

```markdown
# Tic-Tac-Toe Game Server

A multiplayer Tic-Tac-Toe game server built with Node.js, TypeScript, Socket.io, and the GamerStake Platform SDK.

## Features

- Real-time multiplayer gameplay via Socket.io
- Player authentication via GamerStake SDK
- Match management and result reporting
- Player reconnection support (30-second grace period)
- Automatic match cleanup

## Prerequisites

- Node.js 18+
- npm or yarn
- GamerStake API Key

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

3. Update `.env` with your GamerStake API key

## Development

Run the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## Building

Build for production:
```bash
npm run build
```

The compiled files will be in the `dist/` directory.

## Production

Start the production server:
```bash
npm start
```

## Health Check

Check server health:
```bash
curl http://localhost:3000/health
```

## Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `authenticate` | `{ token, matchId }` | Authenticate with JWT token |
| `make_move` | `{ row, col }` | Make a move (0-2 for each) |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `authenticated` | `{ playerId, username, matchId, symbol, matchStatus }` | Auth successful |
| `auth_error` | `{ message }` | Auth failed |
| `match_started` | `{ matchId, players, currentPlayer, yourSymbol }` | Game begins |
| `game_state` | `{ board, currentPlayer, players, yourSymbol }` | Current state (reconnect) |
| `move_made` | `{ row, col, symbol, currentPlayer, board }` | Move was made |
| `game_finished` | `{ winner, board }` | Game ended |
| `player_disconnected` | `{ playerId, temporary }` | Player left |
| `error` | `{ message }` | General error |

## Deployment

This project is configured for deployment on Railway.

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will automatically build and deploy

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `GAMERSTAKE_API_KEY` | Your API key from admin panel |
| `ENVIRONMENT` | `production` or `staging` |
| `DEBUG` | `false` (must be false in production) |
| `CORS_ORIGIN` | Your frontend domain |
| `PORT` | Railway sets this automatically |
| `NODE_ENV` | `production` |

## License

MIT
```

---

## Step 4: Verify Build Process

Test that the build process works:

```bash
npm run build
```

You should see:
- TypeScript compilation completes without errors
- `dist/` directory is created
- `dist/server.js` exists
- `dist/game/types.js` exists

Test the production build:

```bash
npm start
```

The server should start successfully.

---

## Step 5: Update .gitignore

Ensure `.gitignore` includes all necessary entries:

```
node_modules/
dist/
.env
*.log
.DS_Store
.env.local
.env.*.local
```

---

## Step 6: Environment Variables Summary

### Development (.env)

```env
GAMERSTAKE_API_KEY=your-dev-api-key
ENVIRONMENT=development
DEBUG=true
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
```

### Production (Railway Dashboard)

| Variable | Value | Description |
|----------|-------|-------------|
| `GAMERSTAKE_API_KEY` | `your-prod-api-key` | From admin panel |
| `ENVIRONMENT` | `production` | Must match platform |
| `DEBUG` | `false` | No debug in prod |
| `CORS_ORIGIN` | `https://your-frontend.up.railway.app` | Frontend URL |
| `PORT` | (auto-set) | Railway sets this |
| `NODE_ENV` | `production` | Node environment |

---

## Deployment Checklist

Before deploying to Railway:

- [ ] All code is committed to Git
- [ ] `.env` is in `.gitignore` (never commit API keys)
- [ ] `npm run build` completes successfully
- [ ] `npm start` runs without errors
- [ ] Health endpoint returns correct response
- [ ] All environment variables are documented
- [ ] README.md is complete
- [ ] TypeScript compiles without errors

---

## Railway Deployment Steps

### 1. Push to GitHub

```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### 2. Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your repository

### 3. Configure Build

Railway should auto-detect from `package.json`:
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

### 4. Set Environment Variables

In Railway Dashboard → Variables, add:
- `GAMERSTAKE_API_KEY`
- `ENVIRONMENT=production`
- `DEBUG=false`
- `CORS_ORIGIN` (set after frontend is deployed)

### 5. Deploy

Railway will automatically deploy on push.

### 6. Get Backend URL

After deployment:
```
https://tic-tac-toe-server-production.up.railway.app
```

### 7. Verify Deployment

```bash
curl https://your-railway-url.up.railway.app/health
```

Should return:
```json
{
  "status": "ok",
  "sdk": true,
  "environment": "production"
}
```

---

## Post-Deployment

After deploying:

1. **Deploy Frontend** - Follow frontend iteration docs
2. **Update CORS** - Set `CORS_ORIGIN` to frontend URL
3. **Update Admin Panel** - Set game server URL to frontend URL
4. **Test End-to-End** - Create test match and play through

---

## Troubleshooting

### Build Fails
- Check Railway build logs
- Verify all dependencies in `package.json`
- Ensure TypeScript compiles locally first

### SDK Initialization Fails
- Verify `GAMERSTAKE_API_KEY` is correct
- Check `ENVIRONMENT` matches platform
- Review Railway logs for details

### Health Endpoint Returns Error
- Check server logs
- Verify SDK initialization
- Ensure all environment variables are set

### Socket Connection Fails (CORS)
- Verify `CORS_ORIGIN` matches frontend URL exactly
- Check for trailing slashes
- Ensure frontend is using correct backend URL

---

## Files Required for Deployment

```
tic-tac-toe-server/
├── railway.json      ✅ Railway configuration
├── Procfile          ✅ Process file
├── package.json      ✅ Dependencies and scripts
├── tsconfig.json     ✅ TypeScript config
├── .gitignore        ✅ Git ignore file
├── README.md         ✅ Documentation
└── src/
    ├── server.ts     ✅ Main server
    └── game/
        └── types.ts  ✅ Type definitions
```

---

**Congratulations!** Your Tic-Tac-Toe game server is ready for deployment! 🎮
