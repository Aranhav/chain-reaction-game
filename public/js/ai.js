import { cloneGrid } from './utils.js';

export class AI {
    constructor(game) {
        this.game = game;
    }

    makeMove(grid, playerIndex, rows, cols) {
        const validMoves = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c].owner === null || grid[r][c].owner === playerIndex) {
                    validMoves.push({ r, c });
                }
            }
        }

        if (validMoves.length === 0) return null;

        // Score each move and pick the best one
        let bestMove = null;
        let bestScore = -Infinity;

        for (const move of validMoves) {
            const score = this.evaluateMove(grid, move.r, move.c, playerIndex, rows, cols);
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        return bestMove;
    }

    evaluateMove(grid, r, c, playerIndex, rows, cols) {
        let score = 0;
        const cell = grid[r][c];
        const criticalMass = cell.criticalMass;

        // 1. Position value - corners and edges are strategically valuable
        score += this.getPositionValue(r, c, rows, cols);

        // 2. Check if this move causes a chain reaction
        const resultGrid = this.simulateChainReaction(grid, r, c, playerIndex, rows, cols);

        // 3. Calculate material advantage after the move
        const beforeCounts = this.countOrbs(grid, playerIndex, rows, cols);
        const afterCounts = this.countOrbs(resultGrid, playerIndex, rows, cols);

        // Reward capturing enemy orbs
        const enemyOrbsCaptured = beforeCounts.enemy - afterCounts.enemy;
        score += enemyOrbsCaptured * 15;

        // Reward gaining orbs (chain reactions spread)
        const orbsGained = afterCounts.own - beforeCounts.own;
        score += orbsGained * 5;

        // 4. Bonus for cells near critical mass (about to explode)
        const orbsAfterMove = cell.count + 1;
        if (orbsAfterMove >= criticalMass) {
            // This move will trigger an explosion - check if it's beneficial
            const chainLength = this.getChainLength(grid, r, c, playerIndex, rows, cols);
            score += chainLength * 20; // Big bonus for chain reactions
        } else if (orbsAfterMove === criticalMass - 1) {
            // One away from critical - risky but powerful
            // Check if enemies can easily attack this cell
            const enemyThreat = this.getEnemyThreat(grid, r, c, playerIndex, rows, cols);
            if (enemyThreat > 0) {
                score -= 10; // Penalize if enemy can easily capture
            } else {
                score += 8; // Good setup if safe
            }
        }

        // 5. Avoid placing single orbs where enemies have high adjacent counts
        if (cell.owner === null) {
            const adjacentEnemyThreat = this.getAdjacentEnemyThreat(grid, r, c, playerIndex, rows, cols);
            score -= adjacentEnemyThreat * 8;
        }

        // 6. Prefer attacking enemy cells that are near critical mass
        const adjacentEnemyCritical = this.getAdjacentEnemyCritical(grid, r, c, playerIndex, rows, cols);
        score += adjacentEnemyCritical * 12;

        // 7. Board control - prefer moves that give us more territory
        const controlScore = this.evaluateBoardControl(resultGrid, playerIndex, rows, cols);
        score += controlScore * 2;

        // 8. Check if we win with this move
        if (this.checkWinCondition(resultGrid, playerIndex, rows, cols)) {
            score += 10000; // Winning move
        }

        // 9. Check if NOT making certain moves leads to us losing
        // Penalize if enemy has winning threats we're not addressing
        const enemyThreats = this.getImmediateEnemyThreats(grid, playerIndex, rows, cols);
        if (enemyThreats.length > 0) {
            // Check if our move addresses any threat
            const addressesThreat = this.moveAddressesThreat(grid, r, c, playerIndex, enemyThreats, rows, cols);
            if (!addressesThreat) {
                score -= 50; // Penalize ignoring threats
            }
        }

        return score;
    }

    getPositionValue(r, c, rows, cols) {
        const isTop = r === 0;
        const isBottom = r === rows - 1;
        const isLeft = c === 0;
        const isRight = c === cols - 1;

        // Corners are most valuable (critical mass of 2)
        if ((isTop || isBottom) && (isLeft || isRight)) {
            return 25;
        }
        // Edges are valuable (critical mass of 3)
        if (isTop || isBottom || isLeft || isRight) {
            return 15;
        }
        // Center cells (critical mass of 4)
        return 5;
    }

    countOrbs(grid, playerIndex, rows, cols) {
        let own = 0;
        let enemy = 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c].owner === playerIndex) {
                    own += grid[r][c].count;
                } else if (grid[r][c].owner !== null) {
                    enemy += grid[r][c].count;
                }
            }
        }

        return { own, enemy };
    }

    getChainLength(grid, r, c, playerIndex, rows, cols) {
        // Simulate and count how many explosions occur
        let testGrid = cloneGrid(grid);
        testGrid[r][c].owner = playerIndex;
        testGrid[r][c].count++;

        let chainCount = 0;
        let unstable = true;
        let loops = 0;

        while (unstable && loops < 100) {
            unstable = false;
            loops++;

            let criticals = [];
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    if (testGrid[i][j].count >= testGrid[i][j].criticalMass) {
                        criticals.push({ r: i, c: j, owner: testGrid[i][j].owner });
                    }
                }
            }

            if (criticals.length > 0) {
                unstable = true;
                chainCount += criticals.length;

                for (let crit of criticals) {
                    testGrid[crit.r][crit.c].count -= testGrid[crit.r][crit.c].criticalMass;
                    if (testGrid[crit.r][crit.c].count === 0) testGrid[crit.r][crit.c].owner = null;

                    const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
                    for (let d of dirs) {
                        let nr = crit.r + d.dr;
                        let nc = crit.c + d.dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                            testGrid[nr][nc].owner = crit.owner;
                            testGrid[nr][nc].count++;
                        }
                    }
                }
            }
        }
        return chainCount;
    }

    getEnemyThreat(grid, r, c, playerIndex, rows, cols) {
        // Check if any adjacent enemy cell is at critical mass - 1
        const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
        let threat = 0;

        for (let d of dirs) {
            const nr = r + d.dr;
            const nc = c + d.dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const neighbor = grid[nr][nc];
                if (neighbor.owner !== null && neighbor.owner !== playerIndex) {
                    if (neighbor.count >= neighbor.criticalMass - 1) {
                        threat++;
                    }
                }
            }
        }
        return threat;
    }

    getAdjacentEnemyThreat(grid, r, c, playerIndex, rows, cols) {
        // Count adjacent enemy cells that could capture us
        const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
        let threat = 0;

        for (let d of dirs) {
            const nr = r + d.dr;
            const nc = c + d.dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const neighbor = grid[nr][nc];
                if (neighbor.owner !== null && neighbor.owner !== playerIndex) {
                    // Higher count = bigger threat
                    threat += neighbor.count;
                }
            }
        }
        return threat;
    }

    getAdjacentEnemyCritical(grid, r, c, playerIndex, rows, cols) {
        // Count adjacent enemy cells near critical mass (good targets)
        const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
        let criticalCount = 0;

        for (let d of dirs) {
            const nr = r + d.dr;
            const nc = c + d.dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const neighbor = grid[nr][nc];
                if (neighbor.owner !== null && neighbor.owner !== playerIndex) {
                    if (neighbor.count >= neighbor.criticalMass - 1) {
                        criticalCount++;
                    }
                }
            }
        }
        return criticalCount;
    }

    evaluateBoardControl(grid, playerIndex, rows, cols) {
        let ownCells = 0;
        let enemyCells = 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c].owner === playerIndex) {
                    ownCells++;
                } else if (grid[r][c].owner !== null) {
                    enemyCells++;
                }
            }
        }

        return ownCells - enemyCells;
    }

    checkWinCondition(grid, playerIndex, rows, cols) {
        let hasOwnOrbs = false;
        let hasEnemyOrbs = false;
        let totalOrbs = 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c].count > 0) {
                    totalOrbs += grid[r][c].count;
                    if (grid[r][c].owner === playerIndex) {
                        hasOwnOrbs = true;
                    } else {
                        hasEnemyOrbs = true;
                    }
                }
            }
        }

        // Win if we have orbs and enemy has none (and game has started)
        return hasOwnOrbs && !hasEnemyOrbs && totalOrbs > 1;
    }

    getImmediateEnemyThreats(grid, playerIndex, rows, cols) {
        // Find enemy cells that are at critical mass - can explode next turn
        const threats = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = grid[r][c];
                if (cell.owner !== null && cell.owner !== playerIndex) {
                    if (cell.count >= cell.criticalMass - 1) {
                        // Check if this threatens our cells
                        const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
                        for (let d of dirs) {
                            const nr = r + d.dr;
                            const nc = c + d.dc;
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                                if (grid[nr][nc].owner === playerIndex) {
                                    threats.push({ r, c, threatLevel: cell.count });
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        return threats;
    }

    moveAddressesThreat(grid, r, c, playerIndex, threats, rows, cols) {
        // Check if placing at (r,c) would capture/neutralize any threat
        const resultGrid = this.simulateChainReaction(grid, r, c, playerIndex, rows, cols);

        for (const threat of threats) {
            const threatCell = resultGrid[threat.r][threat.c];
            // Threat is addressed if we captured it or reduced its count
            if (threatCell.owner === playerIndex || threatCell.count < grid[threat.r][threat.c].count) {
                return true;
            }
        }

        return false;
    }

    // Simulate chain reaction for AI decision making
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
