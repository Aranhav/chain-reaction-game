const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        waitingPlayers: waitingQueue.length
    });
});

// Game state management
const rooms = new Map();
const playerRooms = new Map();
const waitingQueue = [];

// Generate 4-character room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Get critical mass for a cell
function getCriticalMass(r, c, rows, cols) {
    let n = 0;
    if (r > 0) n++;
    if (r < rows - 1) n++;
    if (c > 0) n++;
    if (c < cols - 1) n++;
    return n;
}

// Initialize game grid
function createGrid(rows, cols) {
    const grid = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            row.push({
                count: 0,
                owner: null,
                criticalMass: getCriticalMass(r, c, rows, cols)
            });
        }
        grid.push(row);
    }
    return grid;
}

// Validate move on server
function isValidMove(grid, r, c, playerIndex) {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) {
        return false;
    }
    const cell = grid[r][c];
    return cell.owner === null || cell.owner === playerIndex;
}

// Simulate chain reaction (server-side validation)
function simulateMove(grid, r, c, playerIndex, rows, cols) {
    // Deep clone grid
    const newGrid = grid.map(row => row.map(cell => ({ ...cell })));

    // Apply move
    newGrid[r][c].owner = playerIndex;
    newGrid[r][c].count++;

    // Process chain reactions
    let unstable = true;
    let iterations = 0;

    while (unstable && iterations < 1000) {
        unstable = false;
        iterations++;

        const explosions = [];

        // Find all cells that need to explode
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                if (newGrid[i][j].count >= newGrid[i][j].criticalMass) {
                    explosions.push({ r: i, c: j, owner: newGrid[i][j].owner });
                }
            }
        }

        if (explosions.length > 0) {
            unstable = true;

            // Process explosions
            for (const exp of explosions) {
                newGrid[exp.r][exp.c].count -= newGrid[exp.r][exp.c].criticalMass;
                if (newGrid[exp.r][exp.c].count === 0) {
                    newGrid[exp.r][exp.c].owner = null;
                }

                // Spread to neighbors
                const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                for (const [dr, dc] of dirs) {
                    const nr = exp.r + dr;
                    const nc = exp.c + dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                        newGrid[nr][nc].owner = exp.owner;
                        newGrid[nr][nc].count++;
                    }
                }
            }
        }
    }

    return newGrid;
}

// Check win condition
function checkWinner(grid, playerCount) {
    const orbCounts = new Array(playerCount).fill(0);
    let totalOrbs = 0;

    for (const row of grid) {
        for (const cell of row) {
            if (cell.owner !== null) {
                orbCounts[cell.owner]++;
                totalOrbs++;
            }
        }
    }

    if (totalOrbs < playerCount) {
        return null; // Game just started
    }

    const alivePlayers = orbCounts.filter(count => count > 0).length;
    if (alivePlayers === 1) {
        return orbCounts.findIndex(count => count > 0);
    }

    return null;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Auto-match: Find or create a game
    socket.on('auto-match', () => {
        // Check if already in a room
        if (playerRooms.has(socket.id)) {
            socket.emit('error', { message: 'Already in a game' });
            return;
        }

        // Try to find a waiting player
        if (waitingQueue.length > 0) {
            const waitingSocketId = waitingQueue.shift();
            const waitingSocket = io.sockets.sockets.get(waitingSocketId);

            if (waitingSocket) {
                // Create room
                const roomCode = generateRoomCode();
                const room = {
                    code: roomCode,
                    players: [waitingSocketId, socket.id],
                    grid: createGrid(8, 6),
                    rows: 8,
                    cols: 6,
                    currentTurn: 0,
                    status: 'playing',
                    createdAt: Date.now()
                };

                rooms.set(roomCode, room);
                playerRooms.set(waitingSocketId, roomCode);
                playerRooms.set(socket.id, roomCode);

                waitingSocket.join(roomCode);
                socket.join(roomCode);

                // Notify both players
                waitingSocket.emit('game-start', {
                    roomCode,
                    playerIndex: 0,
                    opponentId: socket.id,
                    grid: room.grid,
                    currentTurn: 0
                });

                socket.emit('game-start', {
                    roomCode,
                    playerIndex: 1,
                    opponentId: waitingSocketId,
                    grid: room.grid,
                    currentTurn: 0
                });

                console.log(`Game started: ${roomCode} (${waitingSocketId} vs ${socket.id})`);
            } else {
                // Waiting socket disconnected, add current to queue
                waitingQueue.push(socket.id);
                socket.emit('waiting', { message: 'Looking for opponent...' });
            }
        } else {
            // No one waiting, add to queue
            waitingQueue.push(socket.id);
            socket.emit('waiting', { message: 'Looking for opponent...' });
        }
    });

    // Create private room
    socket.on('create-room', () => {
        if (playerRooms.has(socket.id)) {
            socket.emit('error', { message: 'Already in a game' });
            return;
        }

        const roomCode = generateRoomCode();
        const room = {
            code: roomCode,
            players: [socket.id],
            grid: createGrid(8, 6),
            rows: 8,
            cols: 6,
            currentTurn: 0,
            status: 'waiting',
            isPrivate: true,
            createdAt: Date.now()
        };

        rooms.set(roomCode, room);
        playerRooms.set(socket.id, roomCode);
        socket.join(roomCode);

        socket.emit('room-created', { roomCode });
        console.log(`Private room created: ${roomCode} by ${socket.id}`);
    });

    // Join room by code
    socket.on('join-room', (data) => {
        const { roomCode } = data;

        if (playerRooms.has(socket.id)) {
            socket.emit('error', { message: 'Already in a game' });
            return;
        }

        const room = rooms.get(roomCode.toUpperCase());

        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        if (room.status !== 'waiting') {
            socket.emit('error', { message: 'Game already in progress' });
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', { message: 'Room is full' });
            return;
        }

        // Join the room
        room.players.push(socket.id);
        room.status = 'playing';
        playerRooms.set(socket.id, roomCode.toUpperCase());
        socket.join(roomCode.toUpperCase());

        const hostSocket = io.sockets.sockets.get(room.players[0]);

        // Notify both players
        if (hostSocket) {
            hostSocket.emit('game-start', {
                roomCode: room.code,
                playerIndex: 0,
                opponentId: socket.id,
                grid: room.grid,
                currentTurn: 0
            });
        }

        socket.emit('game-start', {
            roomCode: room.code,
            playerIndex: 1,
            opponentId: room.players[0],
            grid: room.grid,
            currentTurn: 0
        });

        console.log(`Player ${socket.id} joined room ${roomCode}`);
    });

    // Handle move
    socket.on('move', (data) => {
        const { r, c } = data;
        const roomCode = playerRooms.get(socket.id);

        if (!roomCode) {
            socket.emit('error', { message: 'Not in a game' });
            return;
        }

        const room = rooms.get(roomCode);

        if (!room || room.status !== 'playing') {
            socket.emit('error', { message: 'Game not active' });
            return;
        }

        const playerIndex = room.players.indexOf(socket.id);

        if (playerIndex === -1) {
            socket.emit('error', { message: 'Not a player in this game' });
            return;
        }

        if (room.currentTurn !== playerIndex) {
            socket.emit('error', { message: 'Not your turn' });
            return;
        }

        if (!isValidMove(room.grid, r, c, playerIndex)) {
            socket.emit('error', { message: 'Invalid move' });
            return;
        }

        // Apply move and simulate chain reaction
        room.grid = simulateMove(room.grid, r, c, playerIndex, room.rows, room.cols);
        room.currentTurn = (room.currentTurn + 1) % 2;

        // Broadcast move to all players in room
        io.to(roomCode).emit('move-made', {
            r,
            c,
            playerIndex,
            grid: room.grid,
            currentTurn: room.currentTurn
        });

        // Check for winner
        const winner = checkWinner(room.grid, 2);
        if (winner !== null) {
            room.status = 'finished';
            io.to(roomCode).emit('game-over', { winner });
            console.log(`Game ${roomCode} ended. Winner: Player ${winner + 1}`);
        }
    });

    // Cancel waiting/matchmaking
    socket.on('cancel-waiting', () => {
        const index = waitingQueue.indexOf(socket.id);
        if (index > -1) {
            waitingQueue.splice(index, 1);
            socket.emit('waiting-cancelled');
        }
    });

    // Leave room
    socket.on('leave-room', () => {
        handleDisconnect(socket);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        handleDisconnect(socket);
    });

    function handleDisconnect(socket) {
        // Remove from waiting queue
        const queueIndex = waitingQueue.indexOf(socket.id);
        if (queueIndex > -1) {
            waitingQueue.splice(queueIndex, 1);
        }

        // Handle room cleanup
        const roomCode = playerRooms.get(socket.id);
        if (roomCode) {
            const room = rooms.get(roomCode);
            if (room) {
                // Notify other player
                const otherPlayerIndex = room.players.indexOf(socket.id) === 0 ? 1 : 0;
                const otherPlayerId = room.players[otherPlayerIndex];

                if (otherPlayerId) {
                    const otherSocket = io.sockets.sockets.get(otherPlayerId);
                    if (otherSocket) {
                        otherSocket.emit('opponent-disconnected');
                        playerRooms.delete(otherPlayerId);
                        otherSocket.leave(roomCode);
                    }
                }

                // Delete room
                rooms.delete(roomCode);
                console.log(`Room ${roomCode} deleted due to disconnect`);
            }
            playerRooms.delete(socket.id);
        }
    }
});

// Cleanup stale rooms every 5 minutes
setInterval(() => {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [code, room] of rooms) {
        if (now - room.createdAt > staleThreshold) {
            // Notify players and cleanup
            for (const playerId of room.players) {
                const socket = io.sockets.sockets.get(playerId);
                if (socket) {
                    socket.emit('room-expired');
                    socket.leave(code);
                }
                playerRooms.delete(playerId);
            }
            rooms.delete(code);
            console.log(`Stale room ${code} cleaned up`);
        }
    }
}, 5 * 60 * 1000);

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Chain Reaction server running on port ${PORT}`);
    console.log(`WebSocket server ready for connections`);
});
