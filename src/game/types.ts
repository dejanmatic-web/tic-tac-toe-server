import { Socket } from "socket.io";

export interface GamePlayer {
    id: string;
    username: string;
    socket: Socket;
    symbol: "X" | "O" | null;
    registeredWithSDK: boolean; // Track if player was successfully registered via reportPlayerJoin
}
// Match object
export interface GameMatch {
    id: string;
    players: Map<string, GamePlayer>;
    board: string[][];
    currentPlayer: "X" | "O";
    status: "waiting" | "playing" | "finished";
    winner: string | null;
    startedAt?: Date;
}
