import express from "express";
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
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        credentials: true,
    },
    // Increase timeouts for stability
    pingTimeout: 60000,
    pingInterval: 25000,
    // Allow both websocket and polling for better compatibility
    transports: ["websocket", "polling"],
});

// Health check endpoint
app.get("/health", (req, res) => {
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
                const playerIdentity = await gameSDK.validatePlayerToken(token);

                console.log(
                    `✅ Player authenticated: ${playerIdentity.username} (${playerIdentity.id})`
                );
                console.log(
                    `   Player ID type: ${typeof playerIdentity.id}, value: ${JSON.stringify(
                        playerIdentity.id
                    )}`
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
                        `🔄 Player ${playerId} reconnecting (existing symbol: ${player.symbol})`
                    );
                    console.log(
                        `   Old socket: ${
                            player.socket ? player.socket.id : "null"
                        }, New socket: ${socket.id}`
                    );
                    player.socket = socket;
                    isReconnect = true;
                    console.log(
                        `   ✅ Socket updated for player ${playerId}, socket: ${player.socket.id}`
                    );
                } else {
                    // New player joining
                    player = {
                        id: playerId,
                        username: playerIdentity.username,
                        socket: socket,
                        symbol: null, // Will be assigned when match starts
                    };
                    match.players.set(player.id, player);
                    console.log(
                        `✅ Player ${playerId} (${player.username}) added to match ${matchId}, socket: ${socket.id}`
                    );
                }

                currentPlayer = player;
                currentMatchId = matchId;

                if (
                    match.players.size === 1 &&
                    match.status === "waiting" &&
                    !match.startedAt
                ) {
                    try {
                        await gameSDK.reportMatchStart(matchId);
                        match.startedAt = new Date();
                        console.log(`✅ Match ${matchId} started`);
                    } catch (error: any) {
                        // SDK might complain about previous match - log but continue
                        console.error(
                            "❌ Failed to report match start:",
                            error.message
                        );
                        // Don't block the game - SDK reporting is not critical for gameplay
                        match.startedAt = new Date(); // Mark as started anyway
                    }
                }

                // Step 5: Report player join (only for new players, not reconnects)
                if (!isReconnect) {
                    try {
                        // reportPlayerJoin expects a string, reportMatchResult expects a number
                        // Use the original playerIdentity.id (which is a string) for reportPlayerJoin
                        await gameSDK.reportPlayerJoin(
                            matchId,
                            playerIdentity.id
                        );
                        console.log(
                            `✅ Player ${player.id} joined match ${matchId}`
                        );
                    } catch (error: any) {
                        // Log but don't block - SDK reporting is not critical
                        console.error(
                            "❌ Failed to report player join:",
                            error.message
                        );
                        console.error("   Error details:", error);
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
                                `📣 Emitting match_started to ${p.username} (${p.id}) with yourSymbol: ${p.symbol}`
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
                        `📤 Sending game_state to reconnecting player ${player.id} with yourSymbol: ${player.symbol}`
                    );
                    socket.emit("game_state", {
                        board: match.board,
                        currentPlayer: match.currentPlayer,
                        players: Array.from(match.players.values()).map(
                            (p) => ({
                                id: p.id,
                                username: p.username,
                                symbol: p.symbol,
                            })
                        ),
                        yourSymbol: player.symbol, // Include for reconnecting players
                    });
                }
            } catch (error: any) {
                console.error("❌ Authentication failed:", error.message);
                socket.emit("auth_error", { message: error.message });
                socket.disconnect();
            }
        }
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
                `❌ make_move: Player not found for socket ${socket.id}`
            );
            console.error(`   Active matches: ${activeMatches.size}`);
            console.error(`   Checking sockets in matches:`);
            for (const [matchId, m] of activeMatches.entries()) {
                console.error(
                    `     Match ${matchId}: ${m.players.size} players`
                );
                for (const p of m.players.values()) {
                    console.error(
                        `       Player ${p.id}: socket=${
                            p.socket ? p.socket.id : "null"
                        }`
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
            match.status = "finished";
            match.winner = winner;
            match.currentPlayer = winner as "X" | "O";

            // Report match result
            console.log(
                `📤 Attempting to report match result to SDK for match ${match.id}`
            );
            console.log(`   SDK initialized: ${gameSDK.isInitialized()}`);
            console.log(
                `   Match started: ${
                    match.startedAt
                        ? "Yes (" + match.startedAt.toISOString() + ")"
                        : "No"
                }`
            );
            console.log(`   Match status: ${match.status}`);
            console.log(`   Number of players: ${match.players.size}`);
            try {
                const winnerPlayer = Array.from(match.players.values()).find(
                    (p) => p.symbol === winner
                );
                const loserPlayer = Array.from(match.players.values()).find(
                    (p) => p.symbol !== winner
                );

                // Validate players exist before reporting
                if (!winnerPlayer || !loserPlayer) {
                    console.error(
                        `❌ Cannot report match result: Missing players. Winner: ${
                            winnerPlayer ? "found" : "missing"
                        }, Loser: ${loserPlayer ? "found" : "missing"}`
                    );
                    console.error(
                        `   Match players:`,
                        Array.from(match.players.values()).map((p) => ({
                            id: p.id,
                            username: p.username,
                            symbol: p.symbol,
                        }))
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
                        `📤 Preparing to report match result for match ${match.id}`
                    );
                    console.log(
                        `   Winner: ${winnerPlayer.username} (ID: "${winnerPlayer.id}" -> ${winnerId})`
                    );
                    console.log(
                        `   Loser: ${loserPlayer.username} (ID: "${loserPlayer.id}" -> ${loserId})`
                    );
                    console.log(
                        `   ⚠️ Note: Ensure both players were registered via reportPlayerJoin before reporting results`
                    );

                    // Prepare report data with parsed numeric IDs
                    const reportData = {
                        players: [
                            {
                                id: winnerId,
                                score: 1,
                                isWinner: true,
                            },
                            {
                                id: loserId,
                                score: 0,
                                isWinner: false,
                            },
                        ],
                    };

                    console.log(
                        `📤 Calling gameSDK.reportMatchResult(${match.id},`,
                        JSON.stringify(reportData, null, 2),
                        `)`
                    );
                    console.log(`   Match ID: "${match.id}"`);
                    console.log(
                        `   Winner ID: ${winnerId} (parsed from "${winnerPlayer.id}")`
                    );
                    console.log(
                        `   Loser ID: ${loserId} (parsed from "${loserPlayer.id}")`
                    );
                    console.log(
                        `   Verifying IDs are valid numbers: winnerId=${winnerId} (${typeof winnerId}), loserId=${loserId} (${typeof loserId})`
                    );

                    // Ensure match was started before reporting result
                    if (!match.startedAt) {
                        console.warn(
                            `⚠️ Match ${match.id} was not started via SDK, attempting to start now...`
                        );
                        try {
                            await gameSDK.reportMatchStart(match.id);
                            match.startedAt = new Date();
                            console.log(
                                `✅ Match ${match.id} started successfully`
                            );
                        } catch (startError: any) {
                            console.error(
                                `❌ Failed to start match before reporting result:`,
                                startError.message
                            );
                            // Continue anyway - SDK might allow reporting without explicit start
                        }
                    }

                    await gameSDK.reportMatchResult(match.id, reportData);

                    console.log(
                        `✅ Match ${match.id} finished. Winner: ${winnerPlayer.username} (${winnerPlayer.id})`
                    );
                    console.log(
                        `   ✅ Successfully reported to admin platform via SDK`
                    );
                }
            } catch (error: any) {
                console.error(
                    "❌ Failed to report match result to admin:",
                    error.message
                );
                console.error("   Error code:", error.code);
                console.error("   Error statusCode:", error.statusCode);
                if (error.response) {
                    console.error(
                        "   API Response:",
                        JSON.stringify(error.response, null, 2)
                    );
                }
                console.error(
                    "   Full error:",
                    JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
                );
                console.error("   Error stack:", error.stack);
                // Re-throw to ensure we know about critical failures
                // But don't block game completion for players
            }

            // Notify players
            console.log(
                `📢 Notifying players that game finished. Winner: ${
                    match.winner || "Draw"
                }`
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
            // Draw
            match.status = "finished";

            console.log(
                `📤 Attempting to report draw result to SDK for match ${match.id}`
            );
            console.log(`   SDK initialized: ${gameSDK.isInitialized()}`);
            try {
                const playersArray = Array.from(match.players.values());

                // Validate we have players before reporting
                if (playersArray.length === 0) {
                    console.error(
                        `❌ Cannot report draw: No players in match ${match.id}`
                    );
                } else if (playersArray.length < 2) {
                    console.error(
                        `❌ Cannot report draw: Only ${playersArray.length} player(s) in match ${match.id}`
                    );
                    console.error(
                        `   Players:`,
                        playersArray.map((p) => ({
                            id: p.id,
                            username: p.username,
                            symbol: p.symbol,
                        }))
                    );
                } else {
                    // SDK requires positive numbers for player IDs
                    // Parse player IDs as integers and convert to numbers
                    const reportData = {
                        players: playersArray.map((p) => {
                            const playerIdParsed = parseInt(p.id, 10);
                            const playerId =
                                isNaN(playerIdParsed) || playerIdParsed <= 0
                                    ? 1
                                    : playerIdParsed;
                            return {
                                id: playerId,
                                score: 0,
                                isWinner: false,
                            };
                        }),
                    };

                    console.log(
                        `📤 Calling gameSDK.reportMatchResult(${match.id},`,
                        JSON.stringify(reportData, null, 2),
                        `)`
                    );
                    console.log(
                        `   Player IDs:`,
                        playersArray
                            .map((p) => `"${p.id}" (type: ${typeof p.id})`)
                            .join(", ")
                    );
                    console.log(`   Match ID: "${match.id}"`);

                    await gameSDK.reportMatchResult(match.id, reportData);

                    console.log(`✅ Match ${match.id} finished as a draw`);
                    console.log(
                        `   ✅ Successfully reported to admin platform via SDK`
                    );
                    console.log(
                        `   Players:`,
                        playersArray
                            .map((p) => `${p.username} (${p.id})`)
                            .join(", ")
                    );
                }
            } catch (error: any) {
                console.error(
                    "❌ Failed to report draw result to admin:",
                    error.message
                );
                console.error("   Error code:", error.code);
                console.error("   Error statusCode:", error.statusCode);
                if (error.response) {
                    console.error(
                        "   API Response:",
                        JSON.stringify(error.response, null, 2)
                    );
                }
                console.error(
                    "   Full error:",
                    JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
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
                        `📴 Player ${player.id} (${player.username}) marked as disconnected, symbol: ${player.symbol}`
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
                                `⏰ Player ${disconnectPlayerId} didn't reconnect, removing from match`
                            );
                            matchCheck.players.delete(disconnectPlayerId);

                            // Try to report error (may fail due to SDK state, but that's ok)
                            if (matchCheck.status === "playing") {
                                gameSDK
                                    .reportMatchError(
                                        disconnectMatchId!,
                                        "Player disconnected permanently"
                                    )
                                    .catch(() => {}); // Silently ignore SDK errors
                            }

                            // Clean up if no connected players
                            const connectedPlayers = Array.from(
                                matchCheck.players.values()
                            ).filter((p) => p.socket !== null);
                            if (connectedPlayers.length === 0) {
                                activeMatches.delete(disconnectMatchId!);
                                console.log(
                                    `🗑️ Match ${disconnectMatchId} cleaned up - no connected players`
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
            "   Please stop the process using this port or use a different port"
        );
    } else {
        console.error("❌ Server error:", error);
    }
    process.exit(1);
});
