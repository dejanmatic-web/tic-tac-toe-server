# Tic-Tac-Toe Game Server

A multiplayer Tic-Tac-Toe game server built with Node.js, TypeScript, Socket.io, and the GamerStake Platform SDK.

## Features

- Real-time multiplayer gameplay via Socket.io
- Player authentication via GamerStake SDK
- Match management and result reporting
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
- `authenticate`: Authenticate with JWT token and match ID
- `make_move`: Make a move (row, col)

### Server → Client
- `authenticated`: Authentication successful
- `auth_error`: Authentication failed
- `match_started`: Match has started
- `game_state`: Current game state
- `move_made`: Move was made
- `game_finished`: Game ended
- `player_disconnected`: Other player disconnected
- `error`: General error

## Deployment (Render + frontend on Vercel)

This project is configured for deployment on **Render**. Use **CORS** so the frontend (on Vercel) can connect.

### Deploy on Render

1. Push this repo to GitHub and create a **Web Service** on [Render](https://render.com) from the repo.
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npm start`
4. Set **Environment** variables in the Render dashboard (see below).

### CORS (frontend on Vercel)

Set `CORS_ORIGIN` to your Vercel frontend URL so the browser allows Socket.io connections:

- **Single origin:** `CORS_ORIGIN=https://your-app.vercel.app` (no trailing slash)
- **Multiple origins** (e.g. production + preview): comma-separated  
  `CORS_ORIGIN=https://your-app.vercel.app,https://your-app-git-main-you.vercel.app`

After deploying the server on Render, set your **client**’s `NEXT_PUBLIC_SOCKET_URL` to the Render service URL (e.g. `https://tic-tac-toe-server.onrender.com`).

### Required Environment Variables (Render)

| Variable | Description |
|----------|-------------|
| `GAMERSTAKE_API_KEY` | Your API key from admin panel |
| `ENVIRONMENT` | `production` or `staging` |
| `DEBUG` | `false` in production |
| `CORS_ORIGIN` | Your Vercel frontend URL (or comma-separated list) |
| `PORT` | Set automatically by Render |
| `NODE_ENV` | `production` |

## License

MIT



