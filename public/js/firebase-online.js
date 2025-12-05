// Firebase configuration - same as Android app
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, get, update, onValue, off, push, serverTimestamp, query, orderByChild, equalTo, limitToFirst } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyARBVVweJABvRslk5UHs8c7M6Jkmmem1jk",
    authDomain: "chain-reaction-kaiross.firebaseapp.com",
    databaseURL: "https://chain-reaction-kaiross-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chain-reaction-kaiross",
    storageBucket: "chain-reaction-kaiross.firebasestorage.app",
    messagingSenderId: "505268689040",
    appId: "1:505268689040:web:8b0c6a3f9d5e4f2a1b3c4d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// Grid size constants matching Android
const GRID_SIZES = {
    SMALL: { rows: 6, cols: 4, name: 'SMALL' },
    MEDIUM: { rows: 9, cols: 6, name: 'MEDIUM' },
    LARGE: { rows: 12, cols: 8, name: 'LARGE' },
    XLARGE: { rows: 15, cols: 10, name: 'XLARGE' }
};

export class FirebaseOnlineManager {
    constructor(game) {
        this.game = game;
        this.playerIndex = -1;
        this.roomCode = null;
        this.userId = null;
        this.isHost = false;
        this.roomRef = null;
        this.roomListener = null;
        this.authReady = false;

        this.initAuth();
    }

    async initAuth() {
        return new Promise((resolve) => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    this.userId = user.uid;
                    this.authReady = true;
                    console.log('Firebase Auth ready:', this.userId);
                    resolve(user);
                } else {
                    try {
                        const result = await signInAnonymously(auth);
                        this.userId = result.user.uid;
                        this.authReady = true;
                        console.log('Signed in anonymously:', this.userId);
                        resolve(result.user);
                    } catch (error) {
                        console.error('Auth error:', error);
                        resolve(null);
                    }
                }
            });
        });
    }

    async ensureAuth() {
        if (!this.authReady) {
            await this.initAuth();
        }
        return this.userId;
    }

    generateRoomCode() {
        // Match Android: uppercase letters only (no confusing characters)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    createEmptyGrid(rows, cols) {
        const grid = [];
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                let criticalMass;
                const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
                const isEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;

                if (isCorner) criticalMass = 2;
                else if (isEdge) criticalMass = 3;
                else criticalMass = 4;

                row.push({
                    count: 0,
                    owner: -1,  // -1 for empty (matching Android)
                    criticalMass: criticalMass
                });
            }
            grid.push(row);
        }
        return grid;
    }

    gridToFirebase(grid) {
        return grid.map(row => row.map(cell => ({
            count: cell.count,
            owner: cell.owner === null ? -1 : cell.owner,
            criticalMass: cell.criticalMass
        })));
    }

    gridFromFirebase(firebaseGrid) {
        if (!firebaseGrid) return null;
        return firebaseGrid.map((row, r) => row.map((cell, c) => ({
            count: cell.count || 0,
            owner: cell.owner === -1 ? null : cell.owner,
            criticalMass: cell.criticalMass || this.calculateCriticalMass(r, c, firebaseGrid.length, row.length)
        })));
    }

    calculateCriticalMass(r, c, rows, cols) {
        const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
        const isEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
        if (isCorner) return 2;
        if (isEdge) return 3;
        return 4;
    }

    async createGame(isPrivate, gridSizeKey = 'MEDIUM') {
        await this.ensureAuth();
        if (!this.userId) {
            this.showError('Authentication failed');
            return;
        }

        const gridSize = GRID_SIZES[gridSizeKey] || GRID_SIZES.MEDIUM;
        const roomCode = this.generateRoomCode();

        const roomData = {
            host: this.userId,
            hostReady: true,
            guest: null,
            guestReady: false,
            gridSize: gridSize.name,
            rows: gridSize.rows,
            cols: gridSize.cols,
            currentTurn: 0,
            status: 'waiting',
            createdAt: serverTimestamp(),
            grid: this.createEmptyGrid(gridSize.rows, gridSize.cols)
        };

        try {
            const roomsRef = ref(database, `rooms/${roomCode}`);
            await set(roomsRef, roomData);

            this.roomCode = roomCode;
            this.roomRef = roomsRef;
            this.isHost = true;
            this.playerIndex = 0;

            // Show waiting UI
            document.getElementById('lobby-main').style.display = 'none';
            document.getElementById('lobby-waiting').style.display = 'block';
            document.getElementById('waiting-msg').innerText = 'Waiting for opponent...';
            document.getElementById('display-room-code').innerText = roomCode;
            document.getElementById('room-code-container').style.display = 'flex';

            // Start listening for room updates
            this.startRoomListener();

            console.log('Room created:', roomCode);
        } catch (error) {
            console.error('Failed to create room:', error);
            this.showError('Failed to create room');
        }
    }

    async joinGameByCode(code) {
        await this.ensureAuth();
        if (!this.userId) {
            this.showError('Authentication failed');
            return;
        }

        const roomCode = code.toUpperCase();
        document.getElementById('join-error').innerText = '';

        try {
            const roomsRef = ref(database, `rooms/${roomCode}`);
            const snapshot = await get(roomsRef);

            if (!snapshot.exists()) {
                this.showError('Room not found');
                return;
            }

            const roomData = snapshot.val();

            if (roomData.status !== 'waiting') {
                this.showError('Room is not available');
                return;
            }

            if (roomData.host === this.userId) {
                this.showError('Cannot join your own room');
                return;
            }

            // Join the room
            await update(roomsRef, {
                guest: this.userId,
                guestReady: true,
                status: 'playing'
            });

            this.roomCode = roomCode;
            this.roomRef = roomsRef;
            this.isHost = false;
            this.playerIndex = 1;

            // Start listening for room updates
            this.startRoomListener();

            console.log('Joined room:', roomCode);
        } catch (error) {
            console.error('Failed to join room:', error);
            this.showError('Failed to join room');
        }
    }

    async autoMatch() {
        await this.ensureAuth();
        if (!this.userId) {
            this.showError('Authentication failed');
            return;
        }

        // Show waiting UI
        document.getElementById('lobby-main').style.display = 'none';
        document.getElementById('lobby-waiting').style.display = 'block';
        document.getElementById('waiting-msg').innerText = 'Finding opponent...';
        document.getElementById('room-code-container').style.display = 'none';

        try {
            // Look for available rooms
            const roomsRef = ref(database, 'rooms');
            const waitingQuery = query(roomsRef, orderByChild('status'), equalTo('waiting'), limitToFirst(10));
            const snapshot = await get(waitingQuery);

            if (snapshot.exists()) {
                // Try to join an existing room
                for (const [roomCode, roomData] of Object.entries(snapshot.val())) {
                    if (roomData.host !== this.userId && roomData.status === 'waiting') {
                        await this.joinGameByCode(roomCode);
                        return;
                    }
                }
            }

            // No available rooms, create one
            await this.createGame(false);
        } catch (error) {
            console.error('Auto match failed:', error);
            this.showError('Auto match failed');
        }
    }

    startRoomListener() {
        if (!this.roomRef) return;

        this.roomListener = onValue(this.roomRef, (snapshot) => {
            if (!snapshot.exists()) {
                this.handleRoomCancelled();
                return;
            }

            const data = snapshot.val();
            this.handleRoomUpdate(data);
        });
    }

    handleRoomUpdate(data) {
        const myPlayerIndex = this.isHost ? 0 : 1;

        switch (data.status) {
            case 'waiting':
                // Still waiting for opponent
                break;

            case 'playing':
                // Check for rematch (game reset)
                const grid = this.gridFromFirebase(data.grid);
                const isInitialSync = grid.every(row => row.every(cell => cell.count === 0));

                if (isInitialSync) {
                    // Game starting or rematch - close modals and start/restart game
                    document.getElementById('lobby-modal').classList.remove('active');
                    document.getElementById('win-modal').classList.remove('active');
                    this.game.startOnlineGame(myPlayerIndex, grid, data.rows, data.cols);
                    document.getElementById('online-room-id').innerText = this.roomCode;
                    document.getElementById('online-status').style.display = 'block';
                    this.hideControls();
                } else if (this.game.isOnline) {
                    // Game update
                    const isMyTurn = data.currentTurn === myPlayerIndex;

                    // Apply remote move if it's now my turn (opponent just played)
                    if (isMyTurn && data.lastMove && data.lastMove.player !== myPlayerIndex) {
                        this.game.applyOnlineMove({
                            grid: grid,
                            currentTurn: data.currentTurn,
                            lastMove: data.lastMove
                        });
                    }

                    // Check for winner
                    if (data.winner !== undefined && data.winner !== null) {
                        this.game.triggerWin(data.winner);
                    }
                }
                break;

            case 'finished':
                // Handle rematch requests first
                if (data.rematch) {
                    const player0Requested = data.rematch.player0 === true;
                    const player1Requested = data.rematch.player1 === true;

                    // Both players requested - rematch will start (status will change to 'playing')
                    if (player0Requested && player1Requested) {
                        // Rematch accepted - game will reset via acceptRematch()
                        // Don't show win modal, just wait for status to change
                        break;
                    }

                    this.handleRematchState(data.rematch, myPlayerIndex);
                }

                // Only trigger win if game is over and win modal isn't already showing
                if (data.winner !== undefined && !this.game.isGameOver) {
                    this.game.triggerWin(data.winner);
                }
                break;

            case 'player_left':
                const playerLeftWinner = data.winner;
                const playerWhoLeft = data.playerWhoLeft;
                // Trigger win with playerLeft flag so rematch button is hidden
                this.game.triggerWin(playerLeftWinner, true);
                break;

            case 'cancelled':
                this.handleRoomCancelled();
                break;
        }
    }

    handleRematchState(rematch, myPlayerIndex) {
        const opponentIndex = myPlayerIndex === 0 ? 1 : 0;
        const iRequested = rematch[`player${myPlayerIndex}`] === true;
        const opponentRequested = rematch[`player${opponentIndex}`] === true;
        const declined = rematch.declined;

        // Check if rematch was declined
        if (declined !== undefined && declined !== null) {
            if (declined !== myPlayerIndex) {
                // Opponent declined my request
                this.game.handleRematchDeclined();
            }
            return;
        }

        // Both players requested - rematch accepted (handled via acceptRematch resetting game)
        if (iRequested && opponentRequested) {
            return;
        }

        // Opponent requested, waiting for my response
        if (opponentRequested && !iRequested) {
            // Only show if not already showing
            const rematchBtn = document.getElementById('rematch-btn');
            if (rematchBtn && rematchBtn.innerText !== 'Accept Rematch') {
                this.game.showRematchRequest();
            }
        }
    }

    handleRoomCancelled() {
        alert('Room was cancelled');
        this.cleanup();
        document.getElementById('lobby-main').style.display = 'block';
        document.getElementById('lobby-waiting').style.display = 'none';
    }

    async sendMove(r, c, newGrid) {
        if (!this.roomRef) return;

        const gridData = this.gridToFirebase(newGrid);
        const nextTurn = this.playerIndex === 0 ? 1 : 0;

        try {
            await update(this.roomRef, {
                grid: gridData,
                currentTurn: nextTurn,
                lastMove: {
                    row: r,
                    col: c,
                    player: this.playerIndex,
                    timestamp: serverTimestamp()
                }
            });
        } catch (error) {
            console.error('Failed to send move:', error);
        }
    }

    async reportGameOver(winner) {
        if (!this.roomRef) return;

        try {
            await update(this.roomRef, {
                status: 'finished',
                winner: winner,
                finishedAt: serverTimestamp()
            });
        } catch (error) {
            console.error('Failed to report game over:', error);
        }
    }

    async requestRematch() {
        if (!this.roomRef) return;

        try {
            await update(this.roomRef, {
                [`rematch/player${this.playerIndex}`]: true
            });
        } catch (error) {
            console.error('Failed to request rematch:', error);
        }
    }

    async acceptRematch() {
        if (!this.roomRef) return;

        try {
            // Mark acceptance
            await update(this.roomRef, {
                [`rematch/player${this.playerIndex}`]: true
            });

            // Get room data for grid size
            const snapshot = await get(this.roomRef);
            if (snapshot.exists()) {
                const data = snapshot.val();

                // Reset the game
                await update(this.roomRef, {
                    status: 'playing',
                    currentTurn: 0,
                    winner: null,
                    grid: this.createEmptyGrid(data.rows, data.cols),
                    rematch: null,
                    lastMove: null
                });
            }
        } catch (error) {
            console.error('Failed to accept rematch:', error);
        }
    }

    async declineRematch() {
        if (!this.roomRef) return;

        try {
            await update(this.roomRef, {
                'rematch/declined': this.playerIndex
            });
        } catch (error) {
            console.error('Failed to decline rematch:', error);
        }
    }

    async leaveRoom() {
        if (!this.roomRef) return;

        try {
            const snapshot = await get(this.roomRef);
            if (!snapshot.exists()) return;

            const data = snapshot.val();

            if (data.status === 'playing') {
                // Game in progress - mark as player left
                const winner = this.isHost ? 1 : 0;
                await update(this.roomRef, {
                    status: 'player_left',
                    playerWhoLeft: this.playerIndex,
                    winner: winner
                });
            } else if (this.isHost) {
                // Host leaving waiting room - cancel
                await update(this.roomRef, {
                    status: 'cancelled'
                });
            } else {
                // Guest leaving waiting room - reset to waiting
                await update(this.roomRef, {
                    guest: null,
                    guestReady: false,
                    status: 'waiting'
                });
            }
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    }

    cancelWaiting() {
        this.leaveRoom();
        this.cleanup();

        // Close the lobby modal entirely and go back to menu
        document.getElementById('lobby-modal').classList.remove('active');
        document.getElementById('lobby-main').style.display = 'block';
        document.getElementById('lobby-waiting').style.display = 'none';
        document.getElementById('lobby-join').style.display = 'none';

        // Ensure the game is properly reset for local play
        if (this.game) {
            this.game.restartGame();
        }
    }

    cleanup() {
        if (this.roomListener && this.roomRef) {
            off(this.roomRef);
        }
        this.roomRef = null;
        this.roomListener = null;
        this.playerIndex = -1;
        this.roomCode = null;
        this.isHost = false;

        const onlineStatus = document.getElementById('online-status');
        if (onlineStatus) onlineStatus.style.display = 'none';

        this.showControls();
    }

    hideControls() {
        const controls = document.querySelector('.controls-section');
        if (controls) {
            controls.style.display = '';
            controls.classList.add('online-hidden');
        }
    }

    showControls() {
        const controls = document.querySelector('.controls-section');
        if (controls) {
            controls.style.display = '';
            controls.classList.remove('online-hidden');
        }
    }

    showError(message) {
        const errorEl = document.getElementById('join-error');
        if (errorEl) {
            errorEl.innerText = message;
        }
        console.error(message);
    }

    // Get current grid size from UI
    getSelectedGridSize() {
        const select = document.getElementById('grid-select');
        if (!select) return 'MEDIUM';

        const value = select.value;
        switch (value) {
            case 'small': return 'SMALL';
            case 'medium': return 'MEDIUM';
            case 'large': return 'LARGE';
            case 'xlarge': return 'XLARGE';
            default: return 'MEDIUM';
        }
    }
}

// Export for use
export { GRID_SIZES };
