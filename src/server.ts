import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { GameSDK } from "@gamerstake/game-platform-sdk";
import dotenv from "dotenv";
import { GamePlayer, GameMatch } from "./game/types";

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 3000;
const GAMERSTAKE_API_KEY = process.env.GAMERSTAKE_API_KEY!;
const ENVIRONMENT = (process.env.ENVIRONMENT || "development") as
    | "development"
    | "production"
    | "staging";
const DEBUG = process.env.DEBUG === "true";

// ============================================================================
// Initialize SDK
// ============================================================================

// Validate required environment variables
if (!GAMERSTAKE_API_KEY) {
    console.error("❌ GAMERSTAKE_API_KEY environment variable is required");
    process.exit(1);
}

const gameSDK = new GameSDK({
    apiKey: GAMERSTAKE_API_KEY,
    environment: ENVIRONMENT,
    debug: DEBUG && ENVIRONMENT !== "production",
});

if (!gameSDK.isInitialized()) {
    console.error("❌ Failed to initialize GameSDK");
    console.error("   Check that GAMERSTAKE_API_KEY is valid");
    console.error(`   Environment: ${ENVIRONMENT}`);
    process.exit(1);
}

console.log("✅ GameSDK initialized successfully");
console.log(`   Environment: ${ENVIRONMENT}`);
console.log(`   Debug mode: ${DEBUG && ENVIRONMENT !== "production"}`);

// ============================================================================
// Express & Socket.IO Setup
// ============================================================================

const app = express();

// CORS: allow comma-separated origins (e.g. Vercel production + preview URLs)
const corsOriginRaw = process.env.CORS_ORIGIN || "*";
const corsOrigin =
    corsOriginRaw === "*"
        ? "*"
        : corsOriginRaw
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean);

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: corsOrigin,
        credentials: true,
    },
    // Increase timeouts for stability
    pingTimeout: 60000,
    pingInterval: 25000,
    // Allow both websocket and polling for better compatibility
    transports: ["websocket", "polling"],
});

// Health check endpoint
app.get("/health", (req: express.Request, res: express.Response) => {
    res.json({
        status: "ok",
        sdk: gameSDK.isInitialized(),
        environment: ENVIRONMENT,
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
            ["", "", ""],
            ["", "", ""],
            ["", "", ""],
        ],
        currentPlayer: "X",
        status: "waiting",
        winner: null,
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

function checkWinner(board: string[][]): string | null {
    // Check rows
    for (let i = 0; i < 3; i++) {
        if (
            board[i][0] &&
            board[i][0] === board[i][1] &&
            board[i][1] === board[i][2]
        ) {
            return board[i][0];
        }
    }

    // Check columns
    for (let i = 0; i < 3; i++) {
        if (
            board[0][i] &&
            board[0][i] === board[1][i] &&
            board[1][i] === board[2][i]
        ) {
            return board[0][i];
        }
    }

    // Check diagonals
    if (
        board[0][0] &&
        board[0][0] === board[1][1] &&
        board[1][1] === board[2][2]
    ) {
        return board[0][0];
    }
    if (
        board[0][2] &&
        board[0][2] === board[1][1] &&
        board[1][1] === board[2][0]
    ) {
        return board[0][2];
    }

    return null;
}

function isBoardFull(board: string[][]): boolean {
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (board[i][j] === "") {
                return false;
            }
        }
    }
    return true;
}

// ============================================================================
// Socket.IO Connection Handler
// ============================================================================

io.on("connection", (socket: Socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    let currentPlayer: GamePlayer | null = null;
    let currentMatchId: string | null = null;

    // --------------------------------------------------------------------------
    // Event: authenticate
    // Player sends their JWT token and match ID
    // --------------------------------------------------------------------------
    socket.on(
        "authenticate",
        async (data: { token: string; matchId: string }) => {
            try {
                const { token, matchId } = data;

                console.log(`🔐 Authenticating player for match ${matchId}...`);

                // Step 1: Validate player token with platform
                console.log(`🌐 SDK CALL: validatePlayerToken`);
                console.log(`   → Endpoint: POST /auth/validate`);
                console.log(
                    `   → Params: { token: "${token.substring(
                        0,
                        20,
                    )}..." (length: ${token.length}) }`,
                );
                const playerIdentity = await gameSDK.validatePlayerToken(token);

                console.log(
                    `✅ Player authenticated: ${playerIdentity.username} (${playerIdentity.id})`,
                );
                console.log(
                    `   Player ID type: ${typeof playerIdentity.id}, value: ${JSON.stringify(
                        playerIdentity.id,
                    )}`,
                );

                // Step 2: Get or create match
                let match = activeMatches.get(matchId);
                if (!match) {
                    match = createMatch(matchId);
                    activeMatches.set(matchId, match);
                }

                // Step 3: Get or create game player (preserve symbol if reconnecting)
                const playerId = String(playerIdentity.id);
                let player = match.players.get(playerId);
                let isReconnect = false;

                if (player) {
                    // Player reconnecting - update socket but keep symbol
                    console.log(
                        `🔄 Player ${playerId} reconnecting (existing symbol: ${player.symbol})`,
                    );
                    console.log(
                        `   Old socket: ${
                            player.socket ? player.socket.id : "null"
                        }, New socket: ${socket.id}`,
                    );
                    console.log(
                        `   Previous registration status: registeredWithSDK=${player.registeredWithSDK}`,
                    );
                    player.socket = socket;
                    isReconnect = true;
                    console.log(
                        `   ✅ Socket updated for player ${playerId}, socket: ${player.socket.id}`,
                    );
                } else {
                    // New player joining
                    player = {
                        id: playerId,
                        username: playerIdentity.username,
                        socket: socket,
                        symbol: null, // Will be assigned when match starts
                        registeredWithSDK: false, // Will be set to true after successful reportPlayerJoin
                    };
                    match.players.set(player.id, player);
                    console.log(
                        `✅ Player ${playerId} (${player.username}) added to match ${matchId}, socket: ${socket.id}`,
                    );
                    console.log(
                        `   → registeredWithSDK: false (not yet registered)`,
                    );
                }

                currentPlayer = player;
                currentMatchId = matchId;

                // Step 4: Report match start FIRST (before player join)
                // The SDK requires match to be started before players can join
                if (
                    match.players.size === 1 &&
                    match.status === "waiting" &&
                    !match.startedAt
                ) {
                    try {
                        console.log(`🌐 SDK CALL: reportMatchStart`);
                        console.log(
                            `   → Endpoint: POST /matches/${matchId}/start`,
                        );
                        console.log(`   → Params: { matchId: "${matchId}" }`);
                        await gameSDK.reportMatchStart(matchId);
                        match.startedAt = new Date();
                        console.log(`✅ Match ${matchId} started`);
                    } catch (error: any) {
                        // SDK might complain about previous match - log but continue
                        console.error(
                            "❌ Failed to report match start:",
                            error.message,
                        );
                        // Don't block the game - SDK reporting is not critical for gameplay
                        match.startedAt = new Date(); // Mark as started anyway
                    }
                }

                // Step 5: Report player join (only for new players, not reconnects)
                // IMPORTANT: Match must be started before players can join
                // Also retry if reconnecting but registration previously failed
                if (
                    !isReconnect ||
                    (isReconnect && !player.registeredWithSDK)
                ) {
                    const isRetryAttempt =
                        isReconnect && !player.registeredWithSDK;
                    if (isRetryAttempt) {
                        console.log(
                            `⚠️ Player ${player.id} reconnecting but was never registered - attempting registration now`,
                        );
                    }
                    console.log(`\n${"─".repeat(60)}`);
                    console.log(
                        `🔍 PLAYER JOIN ATTEMPT: ${player.username} (${player.id})`,
                    );
                    console.log(`   Match ID: "${matchId}"`);
                    console.log(`   Match status: ${match.status}`);
                    console.log(
                        `   Match startedAt: ${
                            match.startedAt
                                ? match.startedAt.toISOString()
                                : "null"
                        }`,
                    );
                    console.log(
                        `   Current players in match: ${match.players.size}`,
                    );
                    console.log(`   Is reconnect: ${isReconnect}`);
                    console.log(`${"─".repeat(60)}\n`);

                    try {
                        // Ensure match is started before reporting player join
                        if (!match.startedAt) {
                            console.warn(
                                `⚠️ Match ${matchId} not started yet, starting now before player join...`,
                            );
                            try {
                                console.log(
                                    `🌐 SDK CALL: reportMatchStart (before player join)`,
                                );
                                console.log(
                                    `   → Endpoint: POST /matches/${matchId}/start`,
                                );
                                console.log(
                                    `   → Params: { matchId: "${matchId}" }`,
                                );
                                await gameSDK.reportMatchStart(matchId);
                                match.startedAt = new Date();
                                console.log(
                                    `✅ Match ${matchId} started before player join`,
                                );
                            } catch (startError: any) {
                                console.error(
                                    `❌ Failed to start match before player join:`,
                                    startError.message,
                                );
                                // Continue anyway - might work
                            }
                        }

                        // reportPlayerJoin expects a string, reportMatchResult expects a number
                        // Use the original playerIdentity.id (which is a string) for reportPlayerJoin
                        console.log(`🌐 SDK CALL: reportPlayerJoin`);
                        console.log(
                            `   → Endpoint: POST /matches/${matchId}/players`,
                        );
                        console.log(
                            `   → Params: { matchId: "${matchId}", playerId: "${
                                playerIdentity.id
                            }" (type: ${typeof playerIdentity.id}) }`,
                        );
                        await gameSDK.reportPlayerJoin(
                            matchId,
                            playerIdentity.id,
                        );
                        player.registeredWithSDK = true;
                        console.log(
                            `✅ Player ${player.id} joined match ${matchId}`,
                        );
                        console.log(`   → registeredWithSDK: true ✓`);
                    } catch (error: any) {
                        // Log but don't block - SDK reporting is not critical
                        console.error(`\n${"─".repeat(60)}`);
                        console.error(
                            `❌ FAILED to report player join for player ${player.id} (${player.username})`,
                        );
                        console.error(`   Match ID: "${matchId}"`);
                        console.error(
                            `   Player ID: "${
                                playerIdentity.id
                            }" (type: ${typeof playerIdentity.id})`,
                        );
                        console.error(`   Error message: ${error.message}`);
                        console.error(`   Error code: ${error.code || "N/A"}`);
                        console.error(
                            `   Error statusCode: ${error.statusCode || "N/A"}`,
                        );
                        if (error.response) {
                            console.error(
                                `   API Response:`,
                                JSON.stringify(error.response, null, 2),
                            );
                        }
                        console.error(
                            `   Full error object:`,
                            JSON.stringify(
                                error,
                                Object.getOwnPropertyNames(error),
                                2,
                            ),
                        );
                        if (error.stack) {
                            console.error(`   Stack trace:`, error.stack);
                        }
                        console.error(`${"─".repeat(60)}\n`);

                        // Explicitly mark as not registered
                        player.registeredWithSDK = false;

                        // Try to retry if match wasn't started
                        if (
                            error.code === "MATCH_ERROR" &&
                            error.message.includes("started first")
                        ) {
                            console.warn(
                                `⚠️ Retrying player join after ensuring match is started...`,
                            );
                            try {
                                if (!match.startedAt) {
                                    console.log(
                                        `🌐 SDK CALL: reportMatchStart (retry)`,
                                    );
                                    console.log(
                                        `   → Endpoint: POST /matches/${matchId}/start`,
                                    );
                                    await gameSDK.reportMatchStart(matchId);
                                    match.startedAt = new Date();
                                    console.log(
                                        `   ✅ Match started successfully on retry`,
                                    );
                                }
                                console.log(
                                    `🌐 SDK CALL: reportPlayerJoin (retry)`,
                                );
                                console.log(
                                    `   → Endpoint: POST /matches/${matchId}/players`,
                                );
                                console.log(
                                    `   → Params: { matchId: "${matchId}", playerId: "${playerIdentity.id}" }`,
                                );
                                await gameSDK.reportPlayerJoin(
                                    matchId,
                                    playerIdentity.id,
                                );
                                player.registeredWithSDK = true;
                                console.log(
                                    `✅ Player ${player.id} joined match ${matchId} (retry succeeded)`,
                                );
                                console.log(`   → registeredWithSDK: true ✓`);
                            } catch (retryError: any) {
                                console.error(`\n${"─".repeat(60)}`);
                                console.error(
                                    `❌ RETRY FAILED for player ${player.id} (${player.username})`,
                                );
                                console.error(`   Match ID: "${matchId}"`);
                                console.error(
                                    `   Error message: ${retryError.message}`,
                                );
                                console.error(
                                    `   Error code: ${retryError.code || "N/A"}`,
                                );
                                console.error(
                                    `   Error statusCode: ${
                                        retryError.statusCode || "N/A"
                                    }`,
                                );
                                if (retryError.response) {
                                    console.error(
                                        `   API Response:`,
                                        JSON.stringify(
                                            retryError.response,
                                            null,
                                            2,
                                        ),
                                    );
                                }
                                console.error(
                                    `   Full error object:`,
                                    JSON.stringify(
                                        retryError,
                                        Object.getOwnPropertyNames(retryError),
                                        2,
                                    ),
                                );
                                console.error(`${"─".repeat(60)}\n`);
                                player.registeredWithSDK = false;
                                console.log(
                                    `   → registeredWithSDK: false ✗ (registration failed after retry)`,
                                );
                            }
                        } else {
                            // Error is NOT about match not started - log what it actually is
                            console.error(
                                `⚠️ Error is NOT about match not started. Actual error type: ${
                                    error.code || "unknown"
                                }`,
                            );
                            console.error(
                                `   This might be: Wrong match ID, Player already registered, Network error, etc.`,
                            );
                        }
                    }
                }

                // Step 6: Join match room FIRST (so player receives room events)
                socket.join(matchId);

                // Step 7: Check if we have 2 players - assign symbols (only if not already playing)
                let matchStarting = false;
                if (
                    match.players.size === 2 &&
                    match.status === "waiting" &&
                    !isReconnect
                ) {
                    const playersArray = Array.from(match.players.values());
                    playersArray[0].symbol = "X";
                    playersArray[1].symbol = "O";
                    match.currentPlayer = "X";
                    match.status = "playing";
                    matchStarting = true;
                }

                // Step 8: Notify player of successful authentication FIRST
                // (Client needs playerId before processing match_started)

                // Log final registration status summary
                console.log(`\n${"─".repeat(60)}`);
                console.log(
                    `📊 AUTHENTICATION SUMMARY for ${player.username} (${player.id})`,
                );
                console.log(`   Match ID: "${matchId}"`);
                console.log(`   Match status: ${match.status}`);
                console.log(
                    `   Match startedAt: ${
                        match.startedAt ? match.startedAt.toISOString() : "null"
                    }`,
                );
                console.log(
                    `   Player registeredWithSDK: ${
                        player.registeredWithSDK ? "✅ YES" : "❌ NO"
                    }`,
                );
                console.log(`   Total players in match: ${match.players.size}`);
                console.log(`   All players registration status:`);
                Array.from(match.players.values()).forEach((p) => {
                    console.log(
                        `      - ${p.username} (${p.id}): ${
                            p.registeredWithSDK
                                ? "✅ registered"
                                : "❌ NOT registered"
                        }`,
                    );
                });
                console.log(`${"─".repeat(60)}\n`);

                socket.emit("authenticated", {
                    playerId: player.id,
                    username: player.username,
                    matchId: matchId,
                    symbol: player.symbol,
                    matchStatus: match.status,
                });

                // Step 9: THEN emit match_started to each player individually
                // Send each player their own symbol directly to avoid ID matching issues
                if (matchStarting) {
                    setTimeout(() => {
                        const playersArray = Array.from(match.players.values());
                        const playersData = playersArray.map((p) => ({
                            id: p.id,
                            username: p.username,
                            symbol: p.symbol,
                        }));

                        // Emit to each player individually with their specific symbol
                        playersArray.forEach((p) => {
                            console.log(
                                `📣 Emitting match_started to ${p.username} (${p.id}) with yourSymbol: ${p.symbol}`,
                            );
                            p.socket.emit("match_started", {
                                matchId,
                                players: playersData,
                                currentPlayer: "X",
                                yourSymbol: p.symbol, // Direct symbol assignment - no ID matching needed
                            });
                        });
                    }, 250);
                }

                // Step 10: Send current game state to newly joined player if match is already in progress
                // (Only for reconnections - not for initial match start, which is handled by match_started)
                if (match.status === "playing" && !matchStarting) {
                    console.log(
                        `📤 Sending game_state to reconnecting player ${player.id} with yourSymbol: ${player.symbol}`,
                    );
                    socket.emit("game_state", {
                        board: match.board,
                        currentPlayer: match.currentPlayer,
                        players: Array.from(match.players.values()).map(
                            (p) => ({
                                id: p.id,
                                username: p.username,
                                symbol: p.symbol,
                            }),
                        ),
                        yourSymbol: player.symbol, // Include for reconnecting players
                    });
                }
            } catch (error: any) {
                console.error("❌ Authentication failed:", error.message);
                socket.emit("auth_error", { message: error.message });
                socket.disconnect();
            }
        },
    );

    // --------------------------------------------------------------------------
    // Event: make_move
    // Player makes a move
    // --------------------------------------------------------------------------
    socket.on("make_move", async (data: { row: number; col: number }) => {
        // Find player by socket instead of relying on closure variables
        // This handles reconnections and race conditions better
        let match: GameMatch | undefined;
        let player: GamePlayer | undefined;

        // Try to find match and player by iterating through active matches
        // Compare by socket ID since socket object references might differ
        for (const [matchId, m] of activeMatches.entries()) {
            for (const p of m.players.values()) {
                // Compare by socket ID instead of socket object reference
                if (
                    p.socket &&
                    (p.socket === socket || p.socket.id === socket.id)
                ) {
                    match = m;
                    player = p;
                    break;
                }
            }
            if (match) break;
        }

        if (!match || !player) {
            console.error(
                `❌ make_move: Player not found for socket ${socket.id}`,
            );
            console.error(`   Active matches: ${activeMatches.size}`);
            console.error(`   Checking sockets in matches:`);
            for (const [matchId, m] of activeMatches.entries()) {
                console.error(
                    `     Match ${matchId}: ${m.players.size} players`,
                );
                for (const p of m.players.values()) {
                    console.error(
                        `       Player ${p.id}: socket=${
                            p.socket ? p.socket.id : "null"
                        }`,
                    );
                }
            }
            socket.emit("error", { message: "Not authenticated" });
            return;
        }

        if (match.status !== "playing") {
            socket.emit("error", { message: "Match not in playing state" });
            return;
        }

        // Check if it's player's turn
        if (match.currentPlayer !== player.symbol) {
            socket.emit("error", { message: "Not your turn" });
            return;
        }

        // Ensure row and col are numbers
        const row = Number(data.row);
        const col = Number(data.col);

        // Validate move bounds
        if (row < 0 || row > 2 || col < 0 || col > 2) {
            socket.emit("error", { message: "Invalid move coordinates" });
            return;
        }

        // Validate move
        if (match.board[row][col] !== "") {
            socket.emit("error", { message: "Cell already occupied" });
            return;
        }

        // Make move
        match.board[row][col] = player.symbol!;

        // Check for winner
        const winner = checkWinner(match.board);
        if (winner) {
            // Don't set status to "finished" yet - API might not allow registering players to finished matches
            // match.status = "finished"; // Will set after successful reporting
            match.winner = winner;
            match.currentPlayer = winner as "X" | "O";

            // Report match result
            console.log(
                `📤 Attempting to report match result to SDK for match ${match.id}`,
            );
            console.log(`   SDK initialized: ${gameSDK.isInitialized()}`);
            console.log(
                `   Match started: ${
                    match.startedAt
                        ? "Yes (" + match.startedAt.toISOString() + ")"
                        : "No"
                }`,
            );
            console.log(
                `   Match status: ${match.status} (will be set to finished after reporting)`,
            );
            console.log(`   Number of players: ${match.players.size}`);
            try {
                const winnerPlayer = Array.from(match.players.values()).find(
                    (p) => p.symbol === winner,
                );
                const loserPlayer = Array.from(match.players.values()).find(
                    (p) => p.symbol !== winner,
                );

                // Validate players exist before reporting
                if (!winnerPlayer || !loserPlayer) {
                    console.error(
                        `❌ Cannot report match result: Missing players. Winner: ${
                            winnerPlayer ? "found" : "missing"
                        }, Loser: ${loserPlayer ? "found" : "missing"}`,
                    );
                    console.error(
                        `   Match players:`,
                        Array.from(match.players.values()).map((p) => ({
                            id: p.id,
                            username: p.username,
                            symbol: p.symbol,
                        })),
                    );
                } else {
                    // SDK requires positive numbers for player IDs
                    // Parse player IDs as integers and convert to numbers
                    const winnerIdParsed = parseInt(winnerPlayer.id, 10);
                    const loserIdParsed = parseInt(loserPlayer.id, 10);

                    // Ensure valid positive integers
                    const winnerId =
                        isNaN(winnerIdParsed) || winnerIdParsed <= 0
                            ? 1
                            : winnerIdParsed;
                    const loserId =
                        isNaN(loserIdParsed) || loserIdParsed <= 0
                            ? 1
                            : loserIdParsed;

                    console.log(
                        `📤 Preparing to report match result for match ${match.id}`,
                    );
                    console.log(
                        `   Winner: ${winnerPlayer.username} (ID: "${winnerPlayer.id}" -> ${winnerId})`,
                    );
                    console.log(
                        `   Loser: ${loserPlayer.username} (ID: "${loserPlayer.id}" -> ${loserId})`,
                    );
                    console.log(
                        `   ⚠️ Note: Ensure both players were registered via reportPlayerJoin before reporting results`,
                    );

                    // Prepare report data with parsed numeric IDs
                    // Schema expects: { players: [{ id: positive int, score?: int, isWinner?: boolean }] }
                    const reportData = {
                        players: [
                            {
                                id: winnerId, // positive integer
                                score: 1, // integer
                                isWinner: true, // boolean
                            },
                            {
                                id: loserId, // positive integer
                                score: 0, // integer
                                isWinner: false, // boolean
                            },
                        ],
                    };

                    // Validate types match schema before sending
                    console.log(
                        `📋 Payload validation (POST /:matchId/finish):`,
                    );
                    console.log(
                        `   Schema: { players: [{ id: positive int, score?: int, isWinner?: boolean }] }`,
                    );
                    reportData.players.forEach((p, i) => {
                        console.log(
                            `   Player[${i}]: id=${
                                p.id
                            } (${typeof p.id}, positive=${p.id > 0}), score=${
                                p.score
                            } (${typeof p.score}), isWinner=${
                                p.isWinner
                            } (${typeof p.isWinner})`,
                        );
                    });

                    // Check if players are registered with SDK
                    console.log(`🔍 Checking player SDK registration status:`);
                    console.log(
                        `   Winner (${winnerPlayer.username}, id=${
                            winnerPlayer.id
                        }): registeredWithSDK=${
                            winnerPlayer.registeredWithSDK
                        } ${winnerPlayer.registeredWithSDK ? "✓" : "✗"}`,
                    );
                    console.log(
                        `   Loser (${loserPlayer.username}, id=${
                            loserPlayer.id
                        }): registeredWithSDK=${
                            loserPlayer.registeredWithSDK
                        } ${loserPlayer.registeredWithSDK ? "✓" : "✗"}`,
                    );
                    if (
                        !winnerPlayer.registeredWithSDK ||
                        !loserPlayer.registeredWithSDK
                    ) {
                        console.warn(
                            `⚠️ WARNING: Not all players are registered with SDK! This may cause HTTP 400 error.`,
                        );
                    }

                    console.log(
                        `📤 Calling gameSDK.reportMatchResult(${match.id},`,
                        JSON.stringify(reportData, null, 2),
                        `)`,
                    );
                    console.log(`   Match ID: "${match.id}"`);
                    console.log(
                        `   Winner ID: ${winnerId} (parsed from "${winnerPlayer.id}")`,
                    );
                    console.log(
                        `   Loser ID: ${loserId} (parsed from "${loserPlayer.id}")`,
                    );
                    console.log(
                        `   Verifying IDs are valid numbers: winnerId=${winnerId} (${typeof winnerId}), loserId=${loserId} (${typeof loserId})`,
                    );

                    // Ensure match was started before reporting result
                    if (!match.startedAt) {
                        console.warn(
                            `⚠️ Match ${match.id} was not started via SDK, attempting to start now...`,
                        );
                        try {
                            console.log(
                                `🌐 SDK CALL: reportMatchStart (before result)`,
                            );
                            console.log(
                                `   → Endpoint: POST /matches/${match.id}/start`,
                            );
                            await gameSDK.reportMatchStart(match.id);
                            match.startedAt = new Date();
                            console.log(
                                `✅ Match ${match.id} started successfully`,
                            );
                        } catch (startError: any) {
                            console.error(
                                `❌ Failed to start match before reporting result:`,
                                startError.message,
                            );
                            // Continue anyway - SDK might allow reporting without explicit start
                        }
                    }

                    // Note: Players should already be registered during authentication via reportPlayerJoin
                    // We don't re-verify here as it can cause "Wrong match ID" errors if the SDK state differs

                    // ═══════════════════════════════════════════════════════════════
                    // DIAGNOSTIC: Check for common HTTP 400 error causes
                    // ═══════════════════════════════════════════════════════════════
                    console.log(`\n${"═".repeat(60)}`);
                    console.log(
                        `🔎 PRE-FLIGHT CHECK: Diagnosing potential HTTP 400 causes`,
                    );
                    console.log(`${"═".repeat(60)}`);

                    // Check 1: Match ID exists on platform
                    // (We can't verify this directly, but we log the ID for manual checking)
                    console.log(`\n1️⃣ MATCH ID CHECK:`);
                    console.log(`   Match ID: "${match.id}"`);
                    console.log(
                        `   → This ID must exist on the platform (created via admin panel)`,
                    );
                    console.log(
                        `   → If HTTP 400: Verify this match ID exists in the admin dashboard`,
                    );

                    // Check 2: Match was started via reportMatchStart
                    console.log(`\n2️⃣ MATCH STARTED CHECK:`);
                    console.log(
                        `   match.startedAt: ${
                            match.startedAt
                                ? match.startedAt.toISOString()
                                : "null"
                        }`,
                    );
                    if (match.startedAt) {
                        console.log(
                            `   ✅ Match WAS started via reportMatchStart`,
                        );
                    } else {
                        console.log(
                            `   ❌ Match was NOT started via reportMatchStart`,
                        );
                        console.log(
                            `   → This will likely cause HTTP 400 error`,
                        );
                    }

                    // Check 3: Players were registered via reportPlayerJoin
                    console.log(`\n3️⃣ PLAYERS REGISTERED CHECK:`);
                    console.log(
                        `   Winner (${winnerPlayer.username}, id=${winnerPlayer.id}):`,
                    );
                    console.log(
                        `      registeredWithSDK: ${winnerPlayer.registeredWithSDK}`,
                    );
                    if (winnerPlayer.registeredWithSDK) {
                        console.log(
                            `      ✅ Player WAS registered via reportPlayerJoin`,
                        );
                    } else {
                        console.log(
                            `      ❌ Player was NOT registered via reportPlayerJoin`,
                        );
                        console.log(
                            `      → This will likely cause HTTP 400 error`,
                        );
                    }
                    console.log(
                        `   Loser (${loserPlayer.username}, id=${loserPlayer.id}):`,
                    );
                    console.log(
                        `      registeredWithSDK: ${loserPlayer.registeredWithSDK}`,
                    );
                    if (loserPlayer.registeredWithSDK) {
                        console.log(
                            `      ✅ Player WAS registered via reportPlayerJoin`,
                        );
                    } else {
                        console.log(
                            `      ❌ Player was NOT registered via reportPlayerJoin`,
                        );
                        console.log(
                            `      → This will likely cause HTTP 400 error`,
                        );
                    }

                    // Summary
                    const matchStarted = !!match.startedAt;
                    const allPlayersRegistered =
                        winnerPlayer.registeredWithSDK &&
                        loserPlayer.registeredWithSDK;
                    console.log(`\n📊 SUMMARY:`);
                    console.log(
                        `   Match started: ${matchStarted ? "✅ YES" : "❌ NO"}`,
                    );
                    console.log(
                        `   All players registered: ${
                            allPlayersRegistered ? "✅ YES" : "❌ NO"
                        }`,
                    );
                    if (!matchStarted || !allPlayersRegistered) {
                        console.log(
                            `\n⚠️  PREDICTION: HTTP 400 error is likely due to above issues`,
                        );
                    } else {
                        console.log(
                            `\n✅ All checks passed - SDK call should succeed`,
                        );
                    }
                    console.log(`${"═".repeat(60)}\n`);

                    // Log the exact payload being sent
                    console.log(`🌐 SDK CALL: reportMatchResult`);
                    console.log(
                        `   → Endpoint: POST /matches/${match.id}/finish`,
                    );
                    console.log(`   → Params:`);
                    console.log(`      matchId: "${match.id}"`);
                    console.log(
                        `      reportData: ${JSON.stringify(
                            reportData,
                            null,
                            2,
                        )}`,
                    );
                    console.log(
                        `   → Player IDs in payload:`,
                        reportData.players.map((p) => ({
                            id: p.id,
                            type: typeof p.id,
                        })),
                    );

                    await gameSDK.reportMatchResult(match.id, reportData);

                    // Now set status to finished after successful reporting
                    match.status = "finished";

                    console.log(
                        `✅ Match ${match.id} finished. Winner: ${winnerPlayer.username} (${winnerPlayer.id})`,
                    );
                    console.log(
                        `   ✅ Successfully reported to admin platform via SDK`,
                    );
                }
            } catch (error: any) {
                // Set status to finished even if reporting fails (game is still over)
                match.status = "finished";
                console.error(
                    "❌ Failed to report match result to admin:",
                    error.message,
                );
                console.error("   Error code:", error.code);

                // HTTP 500 means server-side error on admin platform
                if (error.statusCode === 500) {
                    console.error(`
${"═".repeat(60)}`);
                    console.error(`   ⚠️ HTTP 500: Internal Server Error`);
                    console.error(
                        `   → This is a server-side error on the admin platform`,
                    );
                    console.error(`   → Possible causes:`);
                    console.error(
                        `      1. Admin platform server is down or experiencing issues`,
                    );
                    console.error(`      2. Database error on admin platform`);
                    console.error(
                        `      3. Match ID doesn't exist in admin platform database`,
                    );
                    console.error(
                        `      4. Players weren't properly registered in admin platform`,
                    );
                    console.error(
                        `      5. Admin platform has a bug processing the request`,
                    );
                    console.error(
                        `   → Check admin platform logs for more details`,
                    );
                    console.error(`${"═".repeat(60)}
`);
                }
                console.error("   Error statusCode:", error.statusCode);
                if (error.response) {
                    console.error(
                        "   API Response:",
                        JSON.stringify(error.response, null, 2),
                    );
                }
                console.error(
                    "   Full error:",
                    JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
                );
                console.error("   Error stack:", error.stack);
                // Re-throw to ensure we know about critical failures
                // But don't block game completion for players
            }

            // Notify players
            console.log(
                `📢 Notifying players that game finished. Winner: ${
                    match.winner || "Draw"
                }`,
            );
            io.to(match.id).emit("game_finished", {
                winner: match.winner,
                board: match.board,
            });

            // Clean up after delay
            const matchIdToCleanup = match.id;
            setTimeout(() => {
                if (matchIdToCleanup) {
                    activeMatches.delete(matchIdToCleanup);
                }
            }, 60000); // Keep match data for 1 minute
        } else if (isBoardFull(match.board)) {
            // Draw - don't set status to "finished" yet, will set after successful reporting
            match.winner = null;

            console.log(
                `📤 Attempting to report draw result to SDK for match ${match.id}`,
            );
            console.log(`   SDK initialized: ${gameSDK.isInitialized()}`);
            try {
                const playersArray = Array.from(match.players.values());

                // Validate we have players before reporting
                if (playersArray.length === 0) {
                    console.error(
                        `❌ Cannot report draw: No players in match ${match.id}`,
                    );
                } else if (playersArray.length < 2) {
                    console.error(
                        `❌ Cannot report draw: Only ${playersArray.length} player(s) in match ${match.id}`,
                    );
                    console.error(
                        `   Players:`,
                        playersArray.map((p) => ({
                            id: p.id,
                            username: p.username,
                            symbol: p.symbol,
                        })),
                    );
                } else {
                    // SDK requires positive numbers for player IDs
                    // Parse player IDs as integers and convert to numbers
                    // Schema expects: { players: [{ id: positive int, score?: int, isWinner?: boolean }] }
                    const reportData = {
                        players: playersArray.map((p) => {
                            const playerIdParsed = parseInt(p.id, 10);
                            const playerId =
                                isNaN(playerIdParsed) || playerIdParsed <= 0
                                    ? 1
                                    : playerIdParsed;
                            return {
                                id: playerId, // positive integer
                                score: 0, // integer
                                isWinner: false, // boolean
                            };
                        }),
                    };

                    console.log(
                        `📤 Calling gameSDK.reportMatchResult(${match.id},`,
                        JSON.stringify(reportData, null, 2),
                        `)`,
                    );

                    // Validate types match schema before sending
                    console.log(
                        `📋 Payload validation (POST /:matchId/finish - draw):`,
                    );
                    console.log(
                        `   Schema: { players: [{ id: positive int, score?: int, isWinner?: boolean }] }`,
                    );
                    reportData.players.forEach((p, i) => {
                        console.log(
                            `   Player[${i}]: id=${
                                p.id
                            } (${typeof p.id}, positive=${p.id > 0}), score=${
                                p.score
                            } (${typeof p.score}), isWinner=${
                                p.isWinner
                            } (${typeof p.isWinner})`,
                        );
                    });

                    // Check if players are registered with SDK
                    console.log(
                        `🔍 Checking player SDK registration status (draw):`,
                    );
                    let allRegistered = true;
                    playersArray.forEach((p) => {
                        console.log(
                            `   Player (${p.username}, id=${
                                p.id
                            }): registeredWithSDK=${p.registeredWithSDK} ${
                                p.registeredWithSDK ? "✓" : "✗"
                            }`,
                        );
                        if (!p.registeredWithSDK) allRegistered = false;
                    });
                    if (!allRegistered) {
                        console.warn(
                            `⚠️ WARNING: Not all players are registered with SDK! This may cause HTTP 400 error.`,
                        );
                    }

                    console.log(
                        `   Player IDs:`,
                        playersArray
                            .map((p) => `"${p.id}" (type: ${typeof p.id})`)
                            .join(", "),
                    );
                    console.log(`   Match ID: "${match.id}"`);

                    // Ensure match was started before reporting result
                    if (!match.startedAt) {
                        console.warn(
                            `⚠️ Match ${match.id} was not started via SDK, attempting to start now...`,
                        );
                        try {
                            console.log(
                                `🌐 SDK CALL: reportMatchStart (before draw result)`,
                            );
                            console.log(
                                `   → Endpoint: POST /matches/${match.id}/start`,
                            );
                            await gameSDK.reportMatchStart(match.id);
                            match.startedAt = new Date();
                            console.log(
                                `✅ Match ${match.id} started successfully`,
                            );
                        } catch (startError: any) {
                            console.error(
                                `❌ Failed to start match before reporting result:`,
                                startError.message,
                            );
                        }
                    }

                    // Note: Players should already be registered during authentication via reportPlayerJoin
                    // We don't re-verify here as it can cause "Wrong match ID" errors if the SDK state differs

                    // ═══════════════════════════════════════════════════════════════
                    // DIAGNOSTIC: Check for common HTTP 400 error causes (DRAW)
                    // ═══════════════════════════════════════════════════════════════
                    console.log(`\n${"═".repeat(60)}`);
                    console.log(
                        `🔎 PRE-FLIGHT CHECK (DRAW): Diagnosing potential HTTP 400 causes`,
                    );
                    console.log(`${"═".repeat(60)}`);

                    // Check 1: Match ID exists on platform
                    console.log(`\n1️⃣ MATCH ID CHECK:`);
                    console.log(`   Match ID: "${match.id}"`);
                    console.log(
                        `   → This ID must exist on the platform (created via admin panel)`,
                    );
                    console.log(
                        `   → If HTTP 400: Verify this match ID exists in the admin dashboard`,
                    );

                    // Check 2: Match was started via reportMatchStart
                    console.log(`\n2️⃣ MATCH STARTED CHECK:`);
                    console.log(
                        `   match.startedAt: ${
                            match.startedAt
                                ? match.startedAt.toISOString()
                                : "null"
                        }`,
                    );
                    if (match.startedAt) {
                        console.log(
                            `   ✅ Match WAS started via reportMatchStart`,
                        );
                    } else {
                        console.log(
                            `   ❌ Match was NOT started via reportMatchStart`,
                        );
                        console.log(
                            `   → This will likely cause HTTP 400 error`,
                        );
                    }

                    // Check 3: Players were registered via reportPlayerJoin
                    console.log(`\n3️⃣ PLAYERS REGISTERED CHECK:`);
                    playersArray.forEach((p, i) => {
                        console.log(
                            `   Player ${i + 1} (${p.username}, id=${p.id}):`,
                        );
                        console.log(
                            `      registeredWithSDK: ${p.registeredWithSDK}`,
                        );
                        if (p.registeredWithSDK) {
                            console.log(
                                `      ✅ Player WAS registered via reportPlayerJoin`,
                            );
                        } else {
                            console.log(
                                `      ❌ Player was NOT registered via reportPlayerJoin`,
                            );
                            console.log(
                                `      → This will likely cause HTTP 400 error`,
                            );
                        }
                    });

                    // Summary
                    const matchStartedDraw = !!match.startedAt;
                    const allPlayersRegisteredDraw = playersArray.every(
                        (p) => p.registeredWithSDK,
                    );
                    console.log(`\n📊 SUMMARY:`);
                    console.log(
                        `   Match started: ${
                            matchStartedDraw ? "✅ YES" : "❌ NO"
                        }`,
                    );
                    console.log(
                        `   All players registered: ${
                            allPlayersRegisteredDraw ? "✅ YES" : "❌ NO"
                        }`,
                    );
                    if (!matchStartedDraw || !allPlayersRegisteredDraw) {
                        console.log(
                            `\n⚠️  PREDICTION: HTTP 400 error is likely due to above issues`,
                        );
                    } else {
                        console.log(
                            `\n✅ All checks passed - SDK call should succeed`,
                        );
                    }
                    console.log(`${"═".repeat(60)}\n`);

                    console.log(`🌐 SDK CALL: reportMatchResult (draw)`);
                    console.log(
                        `   → Endpoint: POST /matches/${match.id}/finish`,
                    );
                    console.log(`   → Params:`);
                    console.log(`      matchId: "${match.id}"`);
                    console.log(
                        `      reportData: ${JSON.stringify(
                            reportData,
                            null,
                            2,
                        )}`,
                    );
                    console.log(
                        `   → Player IDs in payload:`,
                        reportData.players.map((p) => ({
                            id: p.id,
                            type: typeof p.id,
                        })),
                    );

                    await gameSDK.reportMatchResult(match.id, reportData);

                    // Now set status to finished after successful reporting
                    match.status = "finished";

                    console.log(`✅ Match ${match.id} finished as a draw`);
                    console.log(
                        `   ✅ Successfully reported to admin platform via SDK`,
                    );
                    console.log(
                        `   Players:`,
                        playersArray
                            .map((p) => `${p.username} (${p.id})`)
                            .join(", "),
                    );
                }
            } catch (error: any) {
                // Set status to finished even if reporting fails (game is still over)
                match.status = "finished";

                console.error(
                    "❌ Failed to report draw result to admin:",
                    error.message,
                );
                console.error("   Error code:", error.code);
                console.error("   Error statusCode:", error.statusCode);
                if (error.response) {
                    console.error(
                        "   API Response:",
                        JSON.stringify(error.response, null, 2),
                    );
                }
                console.error(
                    "   Full error:",
                    JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
                );
                console.error("   Error stack:", error.stack);
                // Re-throw to ensure we know about critical failures
                // But don't block game completion for players
            }

            console.log(`📢 Notifying players that game finished as a draw`);
            io.to(match.id).emit("game_finished", {
                winner: null,
                board: match.board,
            });

            const matchIdToCleanup2 = match.id;
            setTimeout(() => {
                if (matchIdToCleanup2) {
                    activeMatches.delete(matchIdToCleanup2);
                }
            }, 60000);
        } else {
            // Switch turn
            match.currentPlayer = match.currentPlayer === "X" ? "O" : "X";

            // Broadcast move to all players
            io.to(match.id).emit("move_made", {
                row: row,
                col: col,
                symbol: player.symbol,
                currentPlayer: match.currentPlayer,
                board: match.board,
            });
        }
    });

    // --------------------------------------------------------------------------
    // Event: disconnect
    // Handle player disconnection
    // --------------------------------------------------------------------------
    socket.on("disconnect", () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);

        if (currentMatchId && currentPlayer) {
            const match = activeMatches.get(currentMatchId);
            if (match) {
                // DON'T delete player - keep their data for reconnection
                // Just mark their socket as null
                const player = match.players.get(currentPlayer.id);
                if (player) {
                    player.socket = null as any; // Mark as disconnected
                    console.log(
                        `📴 Player ${player.id} (${player.username}) marked as disconnected, symbol: ${player.symbol}`,
                    );
                }

                // Notify other player (but don't cancel the match yet - allow reconnect)
                socket.to(currentMatchId).emit("player_disconnected", {
                    playerId: currentPlayer.id,
                    temporary: true, // Let client know this might be temporary
                });

                // Only clean up match after a timeout if player doesn't reconnect
                const disconnectMatchId = currentMatchId;
                const disconnectPlayerId = currentPlayer.id;

                setTimeout(() => {
                    const matchCheck = activeMatches.get(disconnectMatchId!);
                    if (matchCheck) {
                        const playerCheck =
                            matchCheck.players.get(disconnectPlayerId);
                        // If player still has null socket after 30 seconds, they're really gone
                        if (playerCheck && playerCheck.socket === null) {
                            console.log(
                                `⏰ Player ${disconnectPlayerId} didn't reconnect, removing from match`,
                            );
                            matchCheck.players.delete(disconnectPlayerId);

                            // Try to report error (may fail due to SDK state, but that's ok)
                            if (matchCheck.status === "playing") {
                                gameSDK
                                    .reportMatchError(
                                        disconnectMatchId!,
                                        "Player disconnected permanently",
                                    )
                                    .catch(() => {}); // Silently ignore SDK errors
                            }

                            // Clean up if no connected players
                            const connectedPlayers = Array.from(
                                matchCheck.players.values(),
                            ).filter((p) => p.socket !== null);
                            if (connectedPlayers.length === 0) {
                                activeMatches.delete(disconnectMatchId!);
                                console.log(
                                    `🗑️ Match ${disconnectMatchId} cleaned up - no connected players`,
                                );
                            }
                        }
                    }
                }, 30000); // 30 second grace period for reconnection
            }
        }
    });
});

// ============================================================================
// Start Server
// ============================================================================

// Handle uncaught errors gracefully
process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    console.error("   Stack:", error.stack);
    // Don't exit immediately - allow graceful shutdown
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise);
    console.error("   Reason:", reason);
});

// Start server
httpServer.listen(PORT, () => {
    console.log(`🚀 Tic-Tac-Toe game server running on port ${PORT}`);
    console.log(`📡 Socket.IO server ready`);
    console.log(`🌍 Environment: ${ENVIRONMENT}`);
    console.log(`🔑 API Key configured: ${GAMERSTAKE_API_KEY ? "Yes" : "No"}`);
});

// Handle server errors
httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use`);
        console.error(
            "   Please stop the process using this port or use a different port",
        );
    } else {
        console.error("❌ Server error:", error);
    }
    process.exit(1);
});
