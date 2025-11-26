export class OnlineManager {
    constructor(game) {
        this.game = game;
        this.playerIndex = -1;
        this.roomCode = null;
        this.socket = io({
            transports: ['websocket', 'polling'],
            upgrade: true
        });
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server:', this.socket.id);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
        });

        // Waiting for opponent
        this.socket.on('waiting', (data) => {
            document.getElementById('lobby-main').style.display = 'none';
            document.getElementById('lobby-waiting').style.display = 'block';
            document.getElementById('waiting-msg').innerText = data.message;
        });

        // Room created (private)
        this.socket.on('room-created', (data) => {
            this.roomCode = data.roomCode;
            document.getElementById('lobby-main').style.display = 'none';
            document.getElementById('lobby-waiting').style.display = 'block';
            document.getElementById('waiting-msg').innerText = "Waiting for friend...";
            document.getElementById('display-room-code').innerText = data.roomCode;
            document.getElementById('room-code-container').style.display = 'flex';
        });

        // Game started
        this.socket.on('game-start', (data) => {
            this.playerIndex = data.playerIndex;
            this.roomCode = data.roomCode;

            document.getElementById('lobby-modal').classList.remove('active');
            this.game.startOnlineGame(data.playerIndex, data.grid);
            document.getElementById('online-room-id').innerText = data.roomCode;
            document.getElementById('online-status').style.display = 'block';
            document.getElementById('local-controls').style.display = 'none';
        });

        // Move received from server
        this.socket.on('move-made', (data) => {
            this.game.applyOnlineMove(data);
        });

        // Game over
        this.socket.on('game-over', (data) => {
            this.game.triggerWin(data.winner);
        });

        // Opponent disconnected
        this.socket.on('opponent-disconnected', () => {
            alert('Opponent disconnected. You win!');
            this.game.triggerWin(this.playerIndex);
        });

        // Error handling
        this.socket.on('error', (data) => {
            console.error('Server error:', data.message);
            document.getElementById('join-error').innerText = data.message;
        });

        // Waiting cancelled
        this.socket.on('waiting-cancelled', () => {
            document.getElementById('lobby-main').style.display = 'block';
            document.getElementById('lobby-waiting').style.display = 'none';
        });

        // Room expired
        this.socket.on('room-expired', () => {
            alert('Room expired due to inactivity');
            this.cleanup();
        });
    }

    autoMatch() {
        this.socket.emit('auto-match');
    }

    createGame(isPrivate) {
        if (isPrivate) {
            this.socket.emit('create-room');
        } else {
            this.socket.emit('auto-match');
        }
    }

    joinGameByCode(code) {
        document.getElementById('join-error').innerText = '';
        this.socket.emit('join-room', { roomCode: code.toUpperCase() });
    }

    sendMove(r, c) {
        this.socket.emit('move', { r, c });
    }

    cancelWaiting() {
        this.socket.emit('cancel-waiting');
    }

    cleanup() {
        this.socket.emit('leave-room');
        this.playerIndex = -1;
        this.roomCode = null;
        document.getElementById('online-status').style.display = 'none';
        document.getElementById('local-controls').style.display = 'flex';
    }
}
