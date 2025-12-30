# Iteration 5: Deployment Preparation

This iteration covers preparing the project for deployment to Railway, including build configuration and deployment files.

---

## Step 1: Create Railway Configuration (Optional)

Create `railway.json` in the root directory (optional, Railway can auto-detect):

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

## Step 2: Create README.md

Create `README.md` in the root directory:

```markdown
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
```

---

## Step 3: Verify Build Process

Test that the build process works:

```bash
npm run build
```

You should see:
- TypeScript compilation completes without errors
- `dist/` directory is created
- `dist/server.js` exists

Test the production build:

```bash
npm start
```

The server should start successfully.

---

## Step 4: Update .gitignore

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

## Step 5: Create Procfile (Optional)

Create `Procfile` in the root directory (for Railway or Heroku):

```
web: npm start
```

---

## Step 6: Verify Environment Variables

Before deploying, ensure you have all required environment variables documented:

**Development (.env):**
- `GAMERSTAKE_API_KEY`
- `ENVIRONMENT=development`
- `DEBUG=true`
- `PORT=3000`
- `NODE_ENV=development`
- `CORS_ORIGIN=*`

**Production (Railway):**
- `GAMERSTAKE_API_KEY` (same as development)
- `ENVIRONMENT=production`
- `DEBUG=false`
- `PORT` (set automatically by Railway)
- `NODE_ENV=production`
- `CORS_ORIGIN=https://your-gamerstake-domain.com`

---

## Step 7: Test Health Endpoint

Before deploying, verify the health endpoint works:

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

1. **Push to GitHub**: Ensure your code is pushed to a GitHub repository

2. **Create Railway Project**:
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your repository

3. **Configure Build**:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`

4. **Set Environment Variables**:
   - Add all required environment variables in Railway dashboard
   - Use production values (ENVIRONMENT=production, DEBUG=false)

5. **Deploy**:
   - Railway will automatically deploy on push
   - Check deployment logs for any errors

6. **Verify Deployment**:
   - Visit: `https://your-railway-url.railway.app/health`
   - Should return: `{"status":"ok","sdk":true,"environment":"production"}`

7. **Update Admin Panel**:
   - Navigate to admin panel → Game Management
   - Edit your game
   - Set Server URL to your Railway URL
   - Save changes

---

## Verification

After completing this iteration, you should have:
- ✅ Build process working
- ✅ Production build tested
- ✅ README.md created
- ✅ Environment variables documented
- ✅ Deployment configuration ready
- ✅ Health endpoint verified

**Next:** Your game server is ready for deployment! Follow the Railway deployment steps above to deploy your game.

---

## Troubleshooting Deployment

### Build Fails
- Check Railway build logs
- Verify all dependencies are in `package.json`
- Ensure TypeScript compiles without errors

### Runtime Errors
- Check Railway runtime logs
- Verify environment variables are set correctly
- Ensure `dist/` folder exists after build

### SDK Initialization Fails
- Verify `GAMERSTAKE_API_KEY` is set correctly
- Check API key matches the game's API key in admin panel
- Ensure `ENVIRONMENT` matches your platform environment

### Health Endpoint Returns Error
- Check server logs
- Verify SDK initialization
- Ensure all environment variables are set

---

**Congratulations!** Your Tic-Tac-Toe game server is now ready for deployment! 🎮

