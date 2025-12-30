# Iteration 1: Project Setup & Configuration

This iteration covers setting up the project structure, installing dependencies, and configuring TypeScript.

---

## Step 1: Initialize Project

In your terminal, run:

```bash
mkdir tic-tac-toe-server
cd tic-tac-toe-server
npm init -y
```

---

## Step 2: Install Dependencies

Install all required dependencies:

```bash
# Core dependencies
npm install express socket.io dotenv

# GamerStake SDK
npm install @gamerstake/game-platform-sdk

# TypeScript (optional but recommended)
npm install -D typescript @types/node @types/express @types/socket.io ts-node nodemon

# Development tools
npm install -D @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint
```

---

## Step 3: Create Project Structure

Create the following directory structure:

```
tic-tac-toe-server/
├── src/
│   ├── server.ts          # Main server file
│   ├── game/
│   │   ├── TicTacToeGame.ts    # Game logic
│   │   └── types.ts            # Type definitions
│   └── socket/
│       └── handlers.ts    # Socket.io event handlers
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

**In Cursor:**
1. Create the `src` directory
2. Create the `src/game` directory
3. Create the `src/socket` directory

---

## Step 4: Configure TypeScript

Create `tsconfig.json` in the root directory:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Step 5: Create Environment Files

Create `.env.example`:

```env
# GamerStake Configuration
GAMERSTAKE_API_KEY=your-api-key-from-admin-panel
ENVIRONMENT=development  # or 'production' for live games
DEBUG=true

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS (for production, set to your domain)
CORS_ORIGIN=*
```

Create `.env` (don't commit this file):

```env
GAMERSTAKE_API_KEY=a1b2c3d4-e5f6-7890-abcd-ef1234567890
ENVIRONMENT=development
DEBUG=true
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
```

**Note:** Replace `a1b2c3d4-e5f6-7890-abcd-ef1234567890` with your actual API key from the admin panel.

---

## Step 6: Update package.json Scripts

Update the `scripts` section in `package.json`:

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "type-check": "tsc --noEmit"
  }
}
```

---

## Step 7: Create .gitignore

Create `.gitignore`:

```
node_modules/
dist/
.env
*.log
.DS_Store
```

---

## Verification

After completing this iteration, you should have:
- ✅ Project initialized with `package.json`
- ✅ All dependencies installed
- ✅ TypeScript configured
- ✅ Project structure created
- ✅ Environment files set up
- ✅ Scripts configured in `package.json`

**Next:** Proceed to [Iteration 2: SDK Integration & Express Server](./ITERATION_02_SDK_INTEGRATION.md)

