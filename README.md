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

## Deployment

This project is configured for deployment on Railway.

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will automatically build and deploy

### Required Environment Variables

- `GAMERSTAKE_API_KEY`: Your API key from admin panel
- `ENVIRONMENT`: `production` or `staging`
- `DEBUG`: `false` (must be false in production)
- `PORT`: Railway sets this automatically
- `NODE_ENV`: `production`
- `CORS_ORIGIN`: Your GamerStake platform domain

## License

MIT

