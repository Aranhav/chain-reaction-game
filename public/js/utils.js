// --- Constants & Utilities ---

export const COLORS = [
    '#FF3B30', // Red
    '#32D74B', // Green
    '#0A84FF', // Blue
    '#FFD60A', // Yellow
    '#BF5AF2', // Purple
    '#64D2FF', // Cyan
    '#FF9F0A', // Orange
    '#FF375F'  // Pink
];

// Helper to darken colors for grid lines or backgrounds if needed
export function adjustColor(color, amount) {
    return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

export function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

export function getCriticalMass(r, c, rows, cols) {
    let n = 0;
    if (r > 0) n++;
    if (r < rows - 1) n++;
    if (c > 0) n++;
    if (c < cols - 1) n++;
    return n;
}

export function cloneGrid(grid) {
    return grid.map(row => row.map(cell => ({...cell})));
}
