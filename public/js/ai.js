import { cloneGrid } from './utils.js';

export class AI {
    constructor(game) {
        this.game = game;
    }

    makeMove(grid, playerIndex, rows, cols) {
        // Simple AI: Random valid move
        // TODO: Implement Minimax or Heuristic based AI for harder difficulty

        const validMoves = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c].owner === null || grid[r][c].owner === playerIndex) {
                    validMoves.push({ r, c });
                }
            }
        }

        if (validMoves.length > 0) {
            // Pick a random move for now
            // In a real implementation, we would simulate moves to find the best one
            const move = validMoves[Math.floor(Math.random() * validMoves.length)];
            return move;
        }
        return null;
    }

    // Simulate chain reaction for AI decision making (future improvement)
    simulateChainReaction(initialGrid, r, c, playerIdx, rows, cols) {
        let grid = cloneGrid(initialGrid);

        // Apply Initial Move
        grid[r][c].owner = playerIdx;
        grid[r][c].count++;

        let unstable = true;
        let loops = 0;

        while (unstable && loops < 100) {
            unstable = false;
            loops++;

            let criticals = [];
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    if (grid[i][j].count >= grid[i][j].criticalMass) {
                        criticals.push({ r: i, c: j, owner: grid[i][j].owner });
                    }
                }
            }

            if (criticals.length > 0) unstable = true;

            for (let crit of criticals) {
                grid[crit.r][crit.c].count -= grid[crit.r][crit.c].criticalMass;
                if (grid[crit.r][crit.c].count === 0) grid[crit.r][crit.c].owner = null;

                const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
                for (let d of dirs) {
                    let nr = crit.r + d.dr;
                    let nc = crit.c + d.dc;
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                        grid[nr][nc].owner = crit.owner;
                        grid[nr][nc].count++;
                    }
                }
            }
        }
        return grid;
    }
}
