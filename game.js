/**
 * Sheep Fight - Lane Logic
 * Replicated mechanics with weight-based pushing and sprite rendering.
 */

/* --- Config --- */
const CONFIG = {
    LANES: 5,
    BASE_SPEED: 1.5,
    SPAWN_COOLDOWN: 500, // ms
    MAX_HP: 1000,
    DAMAGE_PER_FRAME: 2,
};

const UNITS = {
    small: { weight: 10, speed: 2.0, cost: 10, img: 'white', scale: 0.8 },
    medium: { weight: 20, speed: 1.5, cost: 20, img: 'black', scale: 1.0 },
    large: { weight: 40, speed: 1.0, cost: 40, img: 'white', scale: 1.3 } // Not unlocked yet
};

// Assets
const assets = {
    white: new Image(),
    black: new Image()
};
assets.white.src = 'assets/sheep_white.png';
assets.black.src = 'assets/sheep_black.png';

// Canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let gameBounds = { width: 0, height: 0, laneWidth: 0 };

// Game State
let gameState = 'MENU';
let lastTime = 0;
let lastSpawnTime = 0;
let winner = null;
let selectedUnit = 'small'; // Default

// Entities
let sheepList = [];
let particles = [];
let nextId = 0;

// HP
let playerHP = CONFIG.MAX_HP;
let botHP = CONFIG.MAX_HP;

// Inputs
const laneZones = document.querySelectorAll('.lane-zone');
const unitBtns = document.querySelectorAll('.unit-btn');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const handCursor = document.getElementById('hand-cursor');

/* --- Initialization --- */

function init() {
    resize();
    window.addEventListener('resize', resize);

    // Lane Inputs
    laneZones.forEach(zone => {
        zone.addEventListener('click', (e) => {
            if (gameState !== 'PLAYING') return;
            const laneIndex = parseInt(zone.getAttribute('data-lane'));
            trySpawnSheep(laneIndex, 0, selectedUnit);

            // Hide hand cursor if shown
            handCursor.style.display = 'none';
        });
    });

    // Unit Selection
    unitBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('locked')) return;

            // Deselect all
            unitBtns.forEach(b => b.classList.remove('selected'));
            // Select clicked
            btn.classList.add('selected');
            selectedUnit = btn.getAttribute('data-type');
        });
    });

    // Buttons
    startBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);

    // Bot Loop
    setInterval(botLogic, 1200);

    requestAnimationFrame(loop);
}

function startGame() {
    gameState = 'PLAYING';
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    handCursor.style.display = 'block'; // Show tutorial hand

    sheepList = [];
    particles = [];
    playerHP = CONFIG.MAX_HP;
    botHP = CONFIG.MAX_HP;
    updateHUD();
}

function resize() {
    const field = document.getElementById('battle-field');
    canvas.width = field.clientWidth;
    canvas.height = field.clientHeight;
    gameBounds.width = canvas.width;
    gameBounds.height = canvas.height;
    gameBounds.laneWidth = canvas.width / CONFIG.LANES;
}

/* --- Game Logic --- */

function trySpawnSheep(lane, team, typeKey) {
    const now = performance.now();
    if (team === 0) {
        if (now - lastSpawnTime < CONFIG.SPAWN_COOLDOWN) return;
        lastSpawnTime = now;
    }

    const startY = team === 0 ? gameBounds.height - 50 : 50;
    const unitStats = UNITS[typeKey];

    sheepList.push({
        id: nextId++,
        lane: lane,
        x: (lane * gameBounds.laneWidth) + (gameBounds.laneWidth / 2),
        y: startY,
        team: team, // 0 = Player (Up), 1 = Bot (Down)
        ...unitStats, // weight, speed, scale, img
        radius: 30 * unitStats.scale,
        pushForce: 0,
        dy: 0
    });
}

function botLogic() {
    if (gameState !== 'PLAYING') return;

    // Bot decides specific lane or random
    const randomLane = Math.floor(Math.random() * CONFIG.LANES);

    // Choose unit type (mostly small, sometimes medium)
    const type = Math.random() < 0.7 ? 'small' : 'medium';

    // Counter logic: Spawn in lane where player is winning (highest Y < center)
    let dangerousLane = -1;
    let maxAdvancement = 0;

    sheepList.forEach(s => {
        if (s.team === 0 && s.y < gameBounds.height / 2) {
            const distInfo = (gameBounds.height / 2) - s.y;
            if (distInfo > maxAdvancement) {
                maxAdvancement = distInfo;
                dangerousLane = s.lane;
            }
        }
    });

    if (dangerousLane !== -1 && Math.random() < 0.6) {
        trySpawnSheep(dangerousLane, 1, 'medium'); // Counter with medium
    } else {
        trySpawnSheep(randomLane, 1, type);
    }
}

function loop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    if (gameState === 'PLAYING') {
        update(dt);
    }
    draw();
    requestAnimationFrame(loop);
}

function update(dt) {
    // 1. Move all sheep based on speed
    sheepList.forEach(s => {
        const dir = s.team === 0 ? -1 : 1;
        s.y += dir * s.speed;

        // Bounds/Scoring
        if (s.team === 0 && s.y < 0) {
            botHP -= s.weight; // Damage based on weight
            s.dead = true;
            spawnParticles(s.x, s.y, '#e74c3c');
        } else if (s.team === 1 && s.y > gameBounds.height) {
            playerHP -= s.weight;
            s.dead = true;
            spawnParticles(s.x, s.y, '#2ecc71');
        }
    });

    // 2. Resolve Collisions (Pushing)
    for (let i = 0; i < sheepList.length; i++) {
        for (let j = i + 1; j < sheepList.length; j++) {
            const s1 = sheepList[i];
            const s2 = sheepList[j];

            if (s1.lane !== s2.lane) continue;
            if (s1.dead || s2.dead) continue;

            const dist = Math.abs(s1.y - s2.y);
            // Allow slight overlap (0.8 of combined radius) so they look like they are pushing
            const minDist = (s1.radius + s2.radius) * 0.8;

            if (dist < minDist) {
                // Determine relative positions
                const topSheep = s1.y < s2.y ? s1 : s2;
                const bottomSheep = s1.y < s2.y ? s2 : s1;

                // If Same Team: Just stack (Bottom waits for Top)
                if (s1.team === s2.team) {
                    if (s1.team === 0) {
                        // Moving UP. Bottom sheep (higher Y) blocked by Top sheep (lower Y)
                        // bottomSheep should stop or match topSheep's speed if slower
                        // Ideally: bottomSheep.y = topSheep.y + minDist
                        bottomSheep.y = topSheep.y + minDist;
                    } else {
                        // Moving DOWN. Top sheep (lower Y) blocked by Bottom sheep (higher Y)
                        // topSheep.y = bottomSheep.y - minDist;
                        topSheep.y = bottomSheep.y - minDist;
                    }
                }
                // Opposing Teams: WEIGHT BATTLE
                else {
                    // Logic: Calculate net weight difference.
                    // The one with more weight pushes the other.
                    // But we need to sum up weights of value-stacks?
                    // For now, simple pairwise push.

                    const overlap = minDist - dist;
                    const center = (s1.y + s2.y) / 2;

                    if (s1.weight === s2.weight) {
                        // Stalemate - stop both
                        s1.y = center - minDist / 2;
                        s2.y = center + minDist / 2;
                    } else if (s1.weight > s2.weight) {
                        // s1 pushes s2
                        // s1 continues (slowly?), s2 pushed back
                        const pushFactor = 1.0;
                        // Move s2 in direction of s1's movement
                        const pushDir = s1.team === 0 ? -1 : 1;
                        s2.y += pushDir * 2; // Getting pushed back
                        s1.y += pushDir * 0.5; // Slowed down but moving
                    } else {
                        // s2 pushes s1
                        const pushDir = s2.team === 0 ? -1 : 1;
                        s1.y += pushDir * 2;
                        s2.y += pushDir * 0.5;
                    }
                }
            }
        }
    }

    // Cleanup
    sheepList = sheepList.filter(s => !s.dead);
    updateWinCondition();
}

function updateWinCondition() {
    const pHP = Math.max(0, playerHP);
    const bHP = Math.max(0, botHP);

    document.getElementById('player-hp').style.width = (pHP / CONFIG.MAX_HP * 100) + '%';
    document.getElementById('player-hp-text').innerText = Math.floor((pHP / CONFIG.MAX_HP) * 100) + '%';

    document.getElementById('bot-hp').style.width = (bHP / CONFIG.MAX_HP * 100) + '%';
    document.getElementById('bot-hp-text').innerText = Math.floor((bHP / CONFIG.MAX_HP) * 100) + '%';

    if (pHP <= 0 || bHP <= 0) {
        if (gameState === 'END') return;
        gameState = 'END';
        winner = pHP > bHP ? 'player' : 'bot';

        const title = document.getElementById('result-title');
        title.innerText = pHP > bHP ? 'VICTORY!' : 'DEFEAT!';
        title.style.color = pHP > bHP ? '#2ecc71' : '#e74c3c';

        document.getElementById('game-over-screen').classList.remove('hidden');
    }
}

/* --- Rendering --- */

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Sheep
    // Sort by Y so they layer correctly (lower Y is further back if looking top-down perspective?)
    // Actually in 2D top down, usually render top to bottom (low Y to high Y)
    sheepList.sort((a, b) => a.y - b.y);

    sheepList.forEach(s => {
        drawSheepSprite(s);
    });

    // Particles
    particles.forEach((p, index) => {
        p.life -= 0.05;
        p.y += p.vy;
        p.x += p.vx;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (p.life <= 0) particles.splice(index, 1);
    });
}

function drawSheepSprite(s) {
    ctx.save();
    ctx.translate(s.x, s.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, s.radius * 0.6, s.radius * 0.8, s.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sprite
    const img = s.img === 'white' ? assets.white : assets.black;
    const size = s.radius * 2.5; // Sprite size relative to collider

    // Rotate if bot? Bots are moving down.
    // Assuming sprites are "Face Up"
    if (s.team === 1) {
        ctx.rotate(Math.PI); // Rotate 180
    }

    // Wobble
    const wobble = Math.sin(performance.now() * 0.01 + s.id) * 0.1;
    ctx.rotate(wobble);

    if (img.complete) {
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
        // Fallback
        ctx.fillStyle = s.img === 'white' ? '#fff' : '#333';
        ctx.beginPath();
        ctx.arc(0, 0, s.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function spawnParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1.0,
            color: color,
            size: Math.random() * 5 + 3
        });
    }
}

// Start
init();
