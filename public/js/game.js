import { COLORS, adjustColor, getCriticalMass, hexToRgba } from './utils.js';
import { SoundManager } from './sound.js';
import { AI } from './ai.js';
import { OnlineManager } from './online.js';

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = 0;
        this.height = 0;

        // Game State
        this.rows = 9;
        this.cols = 6;
        this.grid = [];
        this.players = 2;
        this.currentTurn = 0;
        this.isGameOver = false;
        this.isAnimating = false;
        this.animations = [];

        // Modes
        this.isOnline = false;
        this.isAI = false;
        this.myPlayerIndex = -1; // For online

        // Managers
        this.sound = new SoundManager();
        this.ai = new AI(this);
        this.online = new OnlineManager(this);

        // UI Elements
        this.turnText = document.getElementById('current-turn-text');
        this.turnIndicator = document.querySelector('.turn-indicator');

        this.init();
    }

    init() {
        // Delay resize to ensure DOM is fully laid out
        setTimeout(() => {
            this.resize();
            this.createGrid();
            requestAnimationFrame(() => this.loop());
        }, 100);

        window.addEventListener('resize', () => {
            // Debounce resize
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => this.resize(), 100);
        });

        // Input Handling
        this.canvas.addEventListener('click', (e) => this.handleClick(e));

        // UI Controls
        document.getElementById('restart-btn').addEventListener('click', () => this.restartGame());
        document.getElementById('play-again-btn').addEventListener('click', () => {
            document.getElementById('win-modal').classList.remove('active');
            this.restartGame();
        });

        // Settings
        document.getElementById('player-select').addEventListener('change', (e) => {
            this.players = parseInt(e.target.value);
            this.restartGame();
        });

        document.getElementById('grid-select').addEventListener('change', (e) => {
            const size = e.target.value;
            if (size === 'small') { this.rows = 6; this.cols = 4; }
            else if (size === 'medium') { this.rows = 9; this.cols = 6; }
            else if (size === 'large') { this.rows = 12; this.cols = 8; }
            else if (size === 'xlarge') { this.rows = 15; this.cols = 10; }
            this.restartGame();
        });

        document.getElementById('ai-toggle').addEventListener('change', (e) => {
            this.isAI = e.target.checked;
            this.restartGame();
        });

        // Online Menu
        document.getElementById('online-menu-btn').addEventListener('click', () => {
            document.getElementById('lobby-modal').classList.add('active');
        });

        document.getElementById('cancel-lobby-btn').addEventListener('click', () => {
            document.getElementById('lobby-modal').classList.remove('active');
        });

        // Lobby Buttons
        document.getElementById('auto-match-btn').addEventListener('click', () => this.online.autoMatch());
        document.getElementById('create-room-btn').addEventListener('click', () => this.online.createGame(true));
        document.getElementById('join-room-btn').addEventListener('click', () => {
            document.getElementById('lobby-main').style.display = 'none';
            document.getElementById('lobby-join').style.display = 'block';
        });

        document.getElementById('back-to-main-btn').addEventListener('click', () => {
            document.getElementById('lobby-join').style.display = 'none';
            document.getElementById('lobby-main').style.display = 'block';
        });

        document.getElementById('confirm-join-btn').addEventListener('click', () => {
            const code = document.getElementById('room-code-input').value;
            if (code.length === 4) this.online.joinGameByCode(code);
        });

        document.getElementById('cancel-waiting-btn').addEventListener('click', () => this.online.cancelWaiting());

        // Copy Code
        document.getElementById('copy-code-btn').addEventListener('click', () => {
            const code = document.getElementById('display-room-code').innerText;
            navigator.clipboard.writeText(code).then(() => {
                const btn = document.getElementById('copy-code-btn');
                btn.classList.add('copied');
                document.getElementById('copy-text').innerText = 'Copied!';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    document.getElementById('copy-text').innerText = 'Copy Code';
                }, 2000);
            });
        });
    }

    resize() {
        this.doResize();
    }

    createGrid() {
        this.grid = [];
        for (let r = 0; r < this.rows; r++) {
            const row = [];
            for (let c = 0; c < this.cols; c++) {
                row.push({
                    count: 0,
                    owner: null,
                    criticalMass: getCriticalMass(r, c, this.rows, this.cols)
                });
            }
            this.grid.push(row);
        }
        this.currentTurn = 0;
        this.isGameOver = false;
        this.updateUI();
    }

    restartGame() {
        this.isOnline = false;
        this.online.cleanup();
        this.animations = []; // Clear animations
        this.isAnimating = false;
        this.isGameOver = false;

        // Resize and recreate grid
        this.doResize();
        this.createGrid();

        // Show controls section (for mobile)
        const controls = document.querySelector('.controls-section');
        if (controls) controls.style.display = 'flex';
    }

    // Synchronous resize without retry delays
    doResize() {
        const container = document.getElementById('game-container');
        if (!container) return;

        const containerWidth = container.clientWidth || 800;
        const containerHeight = container.clientHeight || 600;

        // Calculate cell size to maintain square cells
        const padding = 40;
        const availableWidth = containerWidth - padding * 2;
        const availableHeight = containerHeight - padding * 2;

        const cellByWidth = availableWidth / this.cols;
        const cellByHeight = availableHeight / this.rows;
        const cellSize = Math.min(cellByWidth, cellByHeight);

        this.cellWidth = cellSize;
        this.cellHeight = cellSize;
        this.width = this.cols * cellSize;
        this.height = this.rows * cellSize;

        // Set canvas size with device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';

        // Reset and scale context
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
    }

    startOnlineGame(playerIndex, initialGrid) {
        this.isOnline = true;
        this.myPlayerIndex = playerIndex;
        this.players = 2; // Online is always 1v1 for now
        this.rows = initialGrid.length;
        this.cols = initialGrid[0].length;
        this.grid = initialGrid; // Use server grid
        this.currentTurn = 0;
        this.isGameOver = false;
        this.resize(); // Recalculate cell sizes
        this.updateUI();
    }

    handleClick(e) {
        if (this.isGameOver || this.isAnimating) return;

        // Resume Audio Context on user interaction
        this.sound.resume();

        if (this.isOnline && this.currentTurn !== this.myPlayerIndex) return;
        if (this.isAI && this.currentTurn !== 0) return; // AI's turn

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const c = Math.floor(x / this.cellWidth);
        const r = Math.floor(y / this.cellHeight);

        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
            this.attemptMove(r, c);
        }
    }

    attemptMove(r, c) {
        const cell = this.grid[r][c];
        if (cell.owner === null || cell.owner === this.currentTurn) {
            if (this.isOnline) {
                this.online.sendMove(r, c);
                // Optimistic update? No, wait for server to prevent desync
            } else {
                this.executeMove(r, c, this.currentTurn);
            }
        } else {
            // Invalid move sound?
        }
    }

    applyOnlineMove(data) {
        // data contains: r, c, playerIndex, grid (optional snapshot), currentTurn
        // We can either trust the server's grid or simulate locally.
        // For smooth animation, we simulate locally.
        this.executeMove(data.r, data.c, data.playerIndex);
    }

    executeMove(r, c, playerIndex) {
        this.sound.playPop();

        this.grid[r][c].owner = playerIndex;
        this.grid[r][c].count++;

        this.isAnimating = true;
        this.processChainReaction(playerIndex).then(() => {
            this.isAnimating = false;

            // Check Win
            const winner = this.checkWinner();
            if (winner !== null) {
                this.triggerWin(winner);
            } else {
                this.currentTurn = (this.currentTurn + 1) % this.players;
                this.updateUI();

                // AI Turn
                if (!this.isOnline && this.isAI && this.currentTurn !== 0) {
                    setTimeout(() => {
                        const move = this.ai.makeMove(this.grid, this.currentTurn, this.rows, this.cols);
                        if (move) this.attemptMove(move.r, move.c);
                    }, 500);
                }
            }
        });
    }

    async processChainReaction(playerIndex) {
        let unstable = true;
        let loops = 0;

        while (unstable && loops < 100) {
            unstable = false;
            loops++;

            const criticals = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.grid[r][c].count >= this.grid[r][c].criticalMass) {
                        criticals.push({ r, c });
                    }
                }
            }

            if (criticals.length > 0) {
                unstable = true;
                await new Promise(resolve => setTimeout(resolve, 200)); // Animation delay

                this.sound.playExplosion();

                for (const crit of criticals) {
                    const cell = this.grid[crit.r][crit.c];
                    cell.count -= cell.criticalMass;
                    if (cell.count === 0) cell.owner = null;

                    // Add explosion animation
                    this.animations.push({
                        type: 'explosion',
                        x: (crit.c + 0.5) * this.cellWidth,
                        y: (crit.r + 0.5) * this.cellHeight,
                        color: COLORS[playerIndex],
                        radius: 0,
                        alpha: 1
                    });

                    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                    for (const [dr, dc] of dirs) {
                        const nr = crit.r + dr;
                        const nc = crit.c + dc;
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                            this.grid[nr][nc].owner = playerIndex;
                            this.grid[nr][nc].count++;

                            // Add particle trail
                            this.animations.push({
                                type: 'particle',
                                x: (crit.c + 0.5) * this.cellWidth,
                                y: (crit.r + 0.5) * this.cellHeight,
                                tx: (nc + 0.5) * this.cellWidth,
                                ty: (nr + 0.5) * this.cellHeight,
                                color: COLORS[playerIndex],
                                progress: 0
                            });
                        }
                    }
                }
            }
        }
    }

    checkWinner() {
        if (this.currentTurn === 0 && !this.grid.some(row => row.some(cell => cell.owner !== null))) return null; // Start of game

        const counts = new Array(this.players).fill(0);
        let totalOrbs = 0;

        for (const row of this.grid) {
            for (const cell of row) {
                if (cell.owner !== null) {
                    counts[cell.owner]++;
                    totalOrbs++;
                }
            }
        }

        if (totalOrbs < 2) return null; // Too early

        const activePlayers = counts.map((c, i) => c > 0 ? i : -1).filter(i => i !== -1);

        // If we've played at least one full round (approx)
        // Actually, logic is: if only one player has orbs left, they win.
        // But we need to make sure everyone has had a chance to play? 
        // Standard Chain Reaction rules: Elimination.

        if (activePlayers.length === 1 && totalOrbs > 1) {
            return activePlayers[0];
        }

        return null;
    }

    triggerWin(winnerIndex) {
        this.isGameOver = true;
        this.sound.playWin();

        const color = COLORS[winnerIndex];
        const name = this.isOnline
            ? (winnerIndex === this.myPlayerIndex ? "You Win!" : "You Lose!")
            : `Player ${winnerIndex + 1} Wins!`;

        document.getElementById('winner-text').innerText = name;
        document.getElementById('winner-text').style.color = color;
        document.getElementById('win-modal').classList.add('active');

        // Confetti
        this.spawnConfetti(color);
    }

    spawnConfetti(color) {
        const container = document.getElementById('confetti-container');
        container.innerHTML = '';
        for (let i = 0; i < 50; i++) {
            const el = document.createElement('div');
            el.classList.add('confetti');
            el.style.left = Math.random() * 100 + '%';
            el.style.backgroundColor = color;
            el.style.animationDelay = Math.random() * 2 + 's';
            container.appendChild(el);
        }
    }

    updateUI() {
        const color = COLORS[this.currentTurn];
        this.turnText.innerText = this.isOnline
            ? (this.currentTurn === this.myPlayerIndex ? "Your Turn" : "Opponent's Turn")
            : `Player ${this.currentTurn + 1}'s Turn`;

        this.turnText.style.color = color;
        if (this.turnIndicator) {
            this.turnIndicator.style.borderColor = color;
            this.turnIndicator.style.boxShadow = `0 0 15px ${hexToRgba(color, 0.3)}`;
        }
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        // Update animations
        for (let i = this.animations.length - 1; i >= 0; i--) {
            const anim = this.animations[i];
            if (anim.type === 'explosion') {
                anim.radius += 2;
                anim.alpha -= 0.05;
                if (anim.alpha <= 0) this.animations.splice(i, 1);
            } else if (anim.type === 'particle') {
                anim.progress += 0.1;
                if (anim.progress >= 1) this.animations.splice(i, 1);
            }
        }
    }

    draw() {
        // Safety check - ensure grid exists and matches dimensions
        if (!this.grid || this.grid.length !== this.rows || (this.grid[0] && this.grid[0].length !== this.cols)) {
            return; // Skip drawing if grid is not properly initialized
        }

        // Reset transform for clean draw
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dpr = window.devicePixelRatio || 1;
        this.ctx.scale(dpr, dpr);

        // Get current player color for grid
        const currentColor = COLORS[this.currentTurn] || COLORS[0];

        // Clear background with gradient
        const bgGradient = this.ctx.createRadialGradient(
            this.width / 2, this.height / 2, 0,
            this.width / 2, this.height / 2, Math.max(this.width, this.height)
        );
        bgGradient.addColorStop(0, '#0a0a0a');
        bgGradient.addColorStop(1, '#050505');
        this.ctx.fillStyle = bgGradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw Grid Lines - color matches current player
        this.ctx.shadowBlur = 6;
        this.ctx.shadowColor = hexToRgba(currentColor, 0.4);
        this.ctx.strokeStyle = hexToRgba(currentColor, 0.3);
        this.ctx.lineWidth = 1;

        // Horizontal lines
        for (let r = 0; r <= this.rows; r++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, r * this.cellHeight);
            this.ctx.lineTo(this.width, r * this.cellHeight);
            this.ctx.stroke();
        }

        // Vertical lines
        for (let c = 0; c <= this.cols; c++) {
            this.ctx.beginPath();
            this.ctx.moveTo(c * this.cellWidth, 0);
            this.ctx.lineTo(c * this.cellWidth, this.height);
            this.ctx.stroke();
        }

        this.ctx.shadowBlur = 0;

        // Draw Orbs
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.grid[r]?.[c];
                if (cell && cell.owner !== null && cell.count > 0) {
                    this.drawOrbs(r, c, cell.count, cell.owner);
                }
            }
        }

        // Draw Animations
        for (const anim of this.animations) {
            if (anim.type === 'explosion') {
                // Explosion glow
                this.ctx.beginPath();
                this.ctx.arc(anim.x, anim.y, anim.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = hexToRgba(anim.color, anim.alpha * 0.3);
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = anim.color;
                this.ctx.fill();

                // Shockwave ring
                this.ctx.beginPath();
                this.ctx.arc(anim.x, anim.y, anim.radius * 0.8, 0, Math.PI * 2);
                this.ctx.strokeStyle = hexToRgba(anim.color, anim.alpha);
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
                this.ctx.shadowBlur = 0;

            } else if (anim.type === 'particle') {
                const x = anim.x + (anim.tx - anim.x) * anim.progress;
                const y = anim.y + (anim.ty - anim.y) * anim.progress;
                const alpha = 1 - anim.progress;

                this.ctx.beginPath();
                this.ctx.arc(x, y, 4, 0, Math.PI * 2);
                this.ctx.fillStyle = hexToRgba(anim.color, alpha);
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = anim.color;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
        }

        // Draw outer border in current player color
        this.ctx.strokeStyle = hexToRgba(currentColor, 0.5);
        this.ctx.lineWidth = 2;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = currentColor;
        this.ctx.strokeRect(1, 1, this.width - 2, this.height - 2);
        this.ctx.shadowBlur = 0;
    }

    drawOrbs(r, c, count, owner) {
        const cx = (c + 0.5) * this.cellWidth;
        const cy = (r + 0.5) * this.cellHeight;
        const color = COLORS[owner];
        const cell = this.grid[r][c];
        const criticalMass = cell.criticalMass;

        // Base radius scales with cell size
        const baseRadius = Math.min(this.cellWidth, this.cellHeight) * 0.2;

        // Pulse effect when near critical mass
        const time = Date.now() / 1000;
        const isNearCritical = count >= criticalMass - 1;
        const pulseScale = isNearCritical ? 1 + Math.sin(time * 8) * 0.15 : 1;

        // Orbit offset based on cell size
        const orbitOffset = Math.min(this.cellWidth, this.cellHeight) * 0.2;

        // Rotation speed increases when near critical
        const rotationSpeed = isNearCritical ? time * 5 : time * 2;

        this.ctx.shadowBlur = isNearCritical ? 25 : 15;
        this.ctx.shadowColor = color;

        if (count === 1) {
            this.drawSingleOrb(cx, cy, baseRadius * pulseScale, color);
        } else if (count === 2) {
            // Orbiting pair
            const angle = rotationSpeed;
            this.drawSingleOrb(cx + Math.cos(angle) * orbitOffset, cy + Math.sin(angle) * orbitOffset, baseRadius * pulseScale, color);
            this.drawSingleOrb(cx + Math.cos(angle + Math.PI) * orbitOffset, cy + Math.sin(angle + Math.PI) * orbitOffset, baseRadius * pulseScale, color);
        } else if (count >= 3) {
            // Orbiting trio (or more, show 3)
            const angle = rotationSpeed;
            for (let i = 0; i < Math.min(count, 3); i++) {
                const a = angle + (i * Math.PI * 2 / Math.min(count, 3));
                this.drawSingleOrb(cx + Math.cos(a) * orbitOffset, cy + Math.sin(a) * orbitOffset, baseRadius * pulseScale, color);
            }
        }

        // Draw critical warning ring
        if (isNearCritical) {
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, orbitOffset + baseRadius + 5, 0, Math.PI * 2);
            this.ctx.strokeStyle = hexToRgba(color, 0.3 + Math.sin(time * 10) * 0.2);
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        this.ctx.shadowBlur = 0;
    }

    drawSingleOrb(x, y, radius, color) {
        // Create gradient for 3D effect
        const gradient = this.ctx.createRadialGradient(
            x - radius / 3, y - radius / 3, radius / 10,
            x, y, radius
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.2, adjustColor(color, 50));
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, adjustColor(color, -60));

        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();

        // Inner highlight
        this.ctx.beginPath();
        this.ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.3, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.fill();
    }
}

// Start Game
window.onload = () => {
    new Game();
};
