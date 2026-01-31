/**
 * Hago Sheep Fight Clone
 * Vertical Lane Push Mechanic
 */

/* --- Configuration --- */
const CONFIG = {
    LANES: 5,
    FPS: 60,
    BASE_HP: 100, // Legacy support
    MAX_HP: 100,  // New standard
    PLAYER_COOLDOWN: 400, // ms between spawns
};

const UNIT_TYPES = {
    small: {
        id: 'small',
        str: 10,
        cost: 0,
        speed: 1.6, // 0.8x of 2.0
        scale: 0.8,
        imgKey: 'white',
        label: 'Light'
    },
    medium: {
        id: 'medium',
        str: 20,
        cost: 0,
        speed: 1.2, // 0.8x of 1.5
        scale: 1.0,
        imgKey: 'black',
        label: 'Medium'
    },
    heavy: {
        id: 'heavy',
        str: 30,
        cost: 0,
        speed: 0.8, // 0.8x of 1.0
        scale: 1.3,
        imgKey: 'white',
        label: 'Heavy'
    }
};

// Assets
const assets = {
    white: new Image(),
    black: new Image()
};

// Asset Loading Promise
let assetsLoadedCount = 0;
const onAssetLoad = () => {
    assetsLoadedCount++;
    console.log('Asset loaded:', assetsLoadedCount);
    if (assetsLoadedCount >= 2) {
        state.assetsLoaded = true;
        console.log('All assets loaded');
    }
};

assets.white.onload = onAssetLoad;
assets.black.onload = onAssetLoad;

assets.white.src = 'assets/sheep_white.png';
assets.black.src = 'assets/sheep_black.png';

/* --- Game State --- */
let state = {
    running: false,
    playerHP: CONFIG.MAX_HP,
    botHP: CONFIG.MAX_HP,
    lanes: [], // Array of 5 lane objects
    winner: null,
    selectedUnit: 'small',
    lastSpawnTime: 0,
    assetsLoaded: false,
    // Juice Systems
    particles: [], // {x, y, vx, vy, color, life, size}
    floaters: [],  // {x, y, text, color, life, vy}
    shake: 0       // Screen shake intensity
};

// Lane Structure: { playerUnits: [], botUnits: [], netPush: 0 }
// Unit Structure: { id, x, y, type, team (0=player, 1=bot), str }

let lastTime = 0;
let botTimer = 0;
let nextUnitId = 0;

/* --- Initialization --- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let laneWidth = 0;

function init() {
    setupLanes();
    resize();
    window.addEventListener('resize', resize);

    // UI Listeners
    document.querySelectorAll('.unit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            selectUnit(btn.dataset.type);
        });
    });

    document.querySelectorAll('.lane-zone').forEach(zone => {
        zone.addEventListener('click', () => {
            const laneId = parseInt(zone.dataset.lane);
            spawnPlayerUnit(laneId);
        });
    });

    document.getElementById('restart-btn').addEventListener('click', resetGame);

    resetGame();
    requestAnimationFrame(loop);
}

function setupLanes() {
    state.lanes = [];
    for (let i = 0; i < CONFIG.LANES; i++) {
        state.lanes.push({
            playerUnits: [],
            botUnits: []
        });
    }
}

function resize() {
    const parent = document.getElementById('battle-field');
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    laneWidth = canvas.width / CONFIG.LANES;
}

function resetGame() {
    state.running = true;
    state.playerHP = CONFIG.MAX_HP;
    state.botHP = CONFIG.MAX_HP;
    state.winner = null;
    setupLanes();
    state.particles = [];
    state.floaters = [];
    state.shake = 0;

    document.getElementById('game-over-screen').classList.add('hidden');
    updateUI();
}

function selectUnit(type) {
    state.selectedUnit = type;
    document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('selected'));
    // Fix: Select by data-type, not ID
    const btn = document.querySelector(`.unit-btn[data-type="${type}"]`);
    if (btn) btn.classList.add('selected');
}

/* --- Game Logic --- */

let accumulator = 0;
const FIXED_STEP = 1000 / 60; // Target 60 FPS Logic

function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = timestamp - lastTime;
    if (dt > 1000) dt = 1000; // Cap large lags (tab switching)
    lastTime = timestamp;

    accumulator += dt;

    while (accumulator >= FIXED_STEP) {
        if (state.running) {
            update(FIXED_STEP);
            updateFloaters();
            updateParticles();

            // Shake Decay
            if (state.shake > 0) state.shake *= 0.9;
            if (state.shake < 0.5) state.shake = 0;
        }
        accumulator -= FIXED_STEP;
    }

    if (state.running) {
        draw();
    }

    // Always keep animating for UI/Clouds (if drawn in draw?)
    // Actually draw() clears canvas. If we don't draw when !running, canvas freezes.
    // Ideally we draw always? 
    // Existing code only drew if running. Let's stick to that to avoid errors.

    requestAnimationFrame(loop);
}

function update(dt) {
    // Bot Logic (Every 2 seconds)
    botTimer += dt;
    if (botTimer > 2000) {
        botAction();
        botTimer = 0;
    }

    // Lane Logic (Movement & Physics)
    state.lanes.forEach((lane, laneIndex) => {
        updateLane(lane, laneIndex);
    });

    checkGameOver();
}

function botAction() {
    // Randomly generate small, medium, or heavy sheep
    const types = ['small', 'medium', 'heavy'];
    const randomType = types[Math.floor(Math.random() * types.length)];

    // Pick a random lane
    const randomLane = Math.floor(Math.random() * CONFIG.LANES);

    spawnBotUnit(randomLane, randomType);
}

function spawnPlayerUnit(laneIdx) {
    if (!state.running) return;

    // Cooldown check
    const now = performance.now();
    if (now - (state.lastSpawnTime || 0) < CONFIG.PLAYER_COOLDOWN) return;
    state.lastSpawnTime = now;

    const unitType = UNIT_TYPES[state.selectedUnit];

    // Spawn at Bottom (Player Side)
    const unit = createUnit(laneIdx, unitType, 0);
    state.lanes[laneIdx].playerUnits.push(unit);

    // Hide tutorial hand
    document.getElementById('hand-cursor').style.display = 'none';

    updateUI();
}

function spawnBotUnit(laneIdx, typeKey) {
    const unitType = UNIT_TYPES[typeKey];

    // Spawn at Top (Bot Side)
    const unit = createUnit(laneIdx, unitType, 1);
    state.lanes[laneIdx].botUnits.push(unit);

    updateUI();
}

function createUnit(laneIdx, type, team) {
    const laneX = laneIdx * laneWidth;
    const centerX = laneX + laneWidth / 2;

    // Team 0 (Player) starts at Bottom (Height), moves Up (y decreases)
    // Team 1 (Bot) starts at Top (0), moves Down (y increases)
    const startY = team === 0 ? canvas.height - 40 : 40;

    return {
        id: nextUnitId++,
        x: centerX,
        y: startY,
        type: type, // Reference to config
        str: type.str,
        speed: type.speed,
        team: team,
        radius: 20 * type.scale,
        offset: Math.random() * 100 // Animation offset
    };
}

function updateLane(lane, laneIndex) {
    // 1. Calculate Total Strength per team
    let pStr = lane.playerUnits.reduce((sum, u) => sum + u.str, 0);
    let bStr = lane.botUnits.reduce((sum, u) => sum + u.str, 0);

    // 2. Determine Lane State
    // Net Force: Positive = Player Pushes Up? or Logic says "Sum Left - Sum Right"
    // In Vertical: Player pushes Up (negative Y delta), Bot pushes Down (positive Y delta)

    // If collision happens (units meet):
    // Find leading units
    let pLead = getLeadingUnit(lane.playerUnits, 0); // Lowest Y
    let bLead = getLeadingUnit(lane.botUnits, 1);    // Highest Y

    let interacting = false;
    if (pLead && bLead) {
        // Check distance
        if (pLead.y - bLead.y < 60) { // Close enough to push
            interacting = true;
        }
    }

    // Movement Logic

    // Player Units
    if (!interacting) {
        // Move freely Up
        moveUnits(lane.playerUnits, -1, 1.5); // Base move speed
    } else {
        // Pushing Battle!
        if (pStr > bStr) {
            // Player Stronger: Push Up (Bot retreats Up, Player advances Up)
            moveUnits(lane.playerUnits, -1, 0.5); // Slow advance
            moveUnits(lane.botUnits, -1, 0.5);    // Pushed back
        } else if (bStr > pStr) {
            // Bot Stronger: Push Down
            moveUnits(lane.playerUnits, 1, 0.5); // Pushed back
            moveUnits(lane.botUnits, 1, 0.5);    // Advance
        } else {
            // Stalemate - No move
            // Juice: Sparks flying during clash!
            if (Math.random() < 0.3) {
                spawnParticles((pLead.x + bLead.x) / 2, (pLead.y + bLead.y) / 2, '#fff', 2);
            }
        }
    }

    // Bot Units (Free movement if no interaction)
    if (!interacting) {
        moveUnits(lane.botUnits, 1, 1.5);
    }

    // 3. Check Base Hits & Cleanup

    // Check Player Units hitting Top (Bot Base)
    for (let i = lane.playerUnits.length - 1; i >= 0; i--) {
        let u = lane.playerUnits[i];
        if (u.y < 10) { // Hit Top
            damageBase(1, u.str); // Damage Bot
            spawnParticles(u.x, 10, '#e74c3c', 10);
            state.shake = 5;
            spawnFloater(u.x, 40, `-${u.str}`, '#e74c3c');
            lane.playerUnits.splice(i, 1);
        }
    }

    // Check Bot Units hitting Bottom (Player Base)
    for (let i = lane.botUnits.length - 1; i >= 0; i--) {
        let u = lane.botUnits[i];
        if (u.y > canvas.height - 10) { // Hit Bottom
            damageBase(0, u.str); // Damage Player
            spawnParticles(u.x, canvas.height - 10, '#f1c40f', 10);
            state.shake = 5;
            spawnFloater(u.x, canvas.height - 40, `-${u.str}`, '#f1c40f');
            lane.botUnits.splice(i, 1);
        }
    }
}

function getLeadingUnit(units, team) {
    if (units.length === 0) return null;
    if (team === 0) {
        // Player: Smallest Y is leader (topmost)
        return units.reduce((prev, curr) => (prev.y < curr.y) ? prev : curr);
    } else {
        // Bot: Largest Y is leader (bottommost)
        return units.reduce((prev, curr) => (prev.y > curr.y) ? prev : curr);
    }
}

function moveUnits(units, dir, speedMult) {
    // dir: -1 = Up, 1 = Down
    units.forEach(u => {
        u.y += dir * u.speed * speedMult;
    });
}

function damageBase(teamIdx, amount) {
    // teamIdx: 0 = Player damaged (Bot hit), 1 = Bot damaged (Player hit)
    // Reduce damage multiplier since units are now 10x stronger (10, 20, 30)
    // Was amount * 10, now maybe amount * 0.5 or 1? 
    // If Heavy (30) hits, 30 dmg is 30% of 100 HP. Reasonable.
    const totalDmg = amount;

    if (teamIdx === 0) {
        state.playerHP = Math.max(0, state.playerHP - totalDmg);
        flashScreen('red');
    } else {
        state.botHP = Math.max(0, state.botHP - totalDmg);
        flashScreen('green');
    }
    updateUI();
}

function flashScreen(color) {
    // Visual feedback
}

function checkGameOver() {
    if (state.playerHP <= 0) endGame('Computer Wins!');
    else if (state.botHP <= 0) endGame('You Win!');
}

function endGame(msg) {
    state.running = false;
    document.getElementById('result-title').innerText = msg;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

/* --- Rendering --- */

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear transparently

    ctx.save();
    // Screen Shake Apply
    if (state.shake > 0) {
        const dx = (Math.random() - 0.5) * state.shake * 2;
        const dy = (Math.random() - 0.5) * state.shake * 2;
        ctx.translate(dx, dy);
    }


    // Draw all units and Strength Indicators
    state.lanes.forEach((lane, idx) => {
        // Draw units
        [...lane.playerUnits, ...lane.botUnits].forEach(u => drawUnit(u));

        // Draw Strength Badges
        // Draw Strength Badges
        drawLaneStrength(lane, idx);
    });

    // Draw Particles
    state.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    // Draw Floaters
    ctx.font = 'bold 20px "Fredoka One"';
    ctx.textAlign = 'center';
    state.floaters.forEach(f => {
        ctx.globalAlpha = f.life;
        ctx.fillStyle = f.color; // Text color
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
        ctx.globalAlpha = 1.0;
    });

    ctx.restore(); // Restore shake transform
}

function drawLaneStrength(lane, idx) {
    const pStr = lane.playerUnits.reduce((sum, u) => sum + u.str, 0);
    const bStr = lane.botUnits.reduce((sum, u) => sum + u.str, 0);

    if (pStr === 0 && bStr === 0) return;

    const laneX = idx * laneWidth;
    // Align to the left side of the lane, slightly inset
    const x = laneX + 5;

    // Dynamic Y position: Track the "Front Line"
    // If player is pushing, badge is near their top-most unit.
    let y = canvas.height / 2;

    if (lane.playerUnits.length > 0) {
        const leader = getLeadingUnit(lane.playerUnits, 0);
        if (leader) y = leader.y - 40;
    } else if (lane.botUnits.length > 0) {
        const leader = getLeadingUnit(lane.botUnits, 1);
        if (leader) y = leader.y + 40;
    }

    // Constant clash adjustment
    // If both have units, find the midpoint between leaders?
    if (lane.playerUnits.length > 0 && lane.botUnits.length > 0) {
        const pLead = getLeadingUnit(lane.playerUnits, 0);
        const bLead = getLeadingUnit(lane.botUnits, 1);
        if (pLead && bLead) {
            y = (pLead.y + bLead.y) / 2;
        }
    }

    // Keep within bounds
    y = Math.max(60, Math.min(canvas.height - 60, y));

    ctx.save();
    // Font settings
    ctx.font = 'bold 14px "Fredoka One", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Draw Bot Strenth (Red) - Top or Bottom? Screenshot had green(60) top, red(20) bot? 
    // Actually typically current-player is Green. Let's stack them.

    // Bot Badge (Red)
    if (bStr > 0) {
        drawBadge(ctx, x, y - 10, bStr, '#c0392b');
    }

    // Player Badge (Green)
    if (pStr > 0) {
        // If both present, stack Green below Red? 
        // Let's put Green below Red if y is roughly centered.
        drawBadge(ctx, x, y + 10, pStr, '#2ecc71');
    }

    ctx.restore();
}

function drawBadge(ctx, x, y, value, color) {
    const text = value.toString();
    const pad = 4;
    const paddingX = 6;
    const metrics = ctx.measureText(text);
    const w = metrics.width + paddingX * 2;
    const h = 18;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(x + 2, y - h / 2 + 2, w, h, 4);
    ctx.fill();

    // Box
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y - h / 2, w, h, 4);
    ctx.fill();

    // Text
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x + paddingX, y + 1);
}

function drawUnit(u) {
    // Determine type key based on radius
    let typeKey = 'small';
    if (u.radius > 28) typeKey = 'heavy';
    else if (u.radius > 22) typeKey = 'medium';

    // Call Procedural Renderer
    // Use u.speed for animation freq
    drawProceduralSheep(ctx, u.x, u.y, u.radius, u.team === 0, typeKey, u.speed);
}

function drawProceduralSheep(ctx, x, y, radius, isPlayer, typeKey, speed) {
    ctx.save();

    // Animation Time
    const time = Date.now() / 1000;
    const walkSpeed = speed * (typeKey === 'heavy' ? 15 : 12);
    const walkCycle = Math.sin(time * walkSpeed); // -1 to 1
    const bounce = Math.abs(Math.sin(time * walkSpeed * 2)) * 0.08;

    // Colors (Strictly White & Black Wool)
    let woolColor = '#ffffff';
    let woolShadow = '#e0e0e0';
    let faceColor = '#FFAB91'; // Peach/Pink Face Default
    const hoofColor = '#3E2723';

    // Determine Wool Color (White/Black)
    if (typeKey === 'medium') {
        woolColor = '#212121'; // Black
        woolShadow = '#000000';
    }

    if (!isPlayer) {
        // Bot Face is Grey
        faceColor = '#BDBDBD';
    }

    // Scale/Transform
    ctx.translate(x, y);
    if (!isPlayer) {
        ctx.scale(1, -1);
    }

    // --- DUST PARTICLES (Excitement!) ---
    // Spawn dust occasionally if moving
    if (Math.random() < 0.03 * speed) {
        // Global helper call
        // Offset Y slightly to be at "feet" level
        // Need to untranslate X/Y because spawnParticles uses global coords
        // Actually we are inside translate(x,y). 
        // spawnParticles takes Global.
        // So we assume Global X/Y is x, y + radius.
        // We can't call it easily from inside translate context without coord math?
        // Wait, 'x' and 'y' passed to function ARE global.
        // So we can call it.
        // Feet Y = y + radius * 0.5 (approx).
        spawnParticles(x + (Math.random() - 0.5) * radius, y + radius * 0.5, '#D7CCC8', 1);
    }

    // --- SHADOW ---
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(0, radius, radius * 0.9, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- LEGS (Top-Down: Short & Tucked) ---
    // Much shorter to simulate high angle
    const legW = radius * 0.22;
    const legH = radius * 0.4; // Shorter (was 0.65)
    // Higher up (under body)
    const legY = radius * 0.2; // Was 0.4
    const legX = radius * 0.35;

    // Draw Back Legs
    drawRealLeg(ctx, -legX, legY, legW, legH, walkCycle, faceColor, hoofColor, true);
    drawRealLeg(ctx, legX, legY, legW, legH, -walkCycle, faceColor, hoofColor, true);

    // --- BODY (Fluffy Top View) ---
    const bodyY = -bounce * radius * 3;

    // Draw Base Body (Wider for top-down)
    ctx.fillStyle = woolColor;
    const puffs = 8;
    const puffRad = radius * 0.6; // Fluffier

    for (let i = 0; i < puffs; i++) {
        const angle = (i / puffs) * Math.PI * 2;
        const px = Math.cos(angle) * (radius * 0.7);
        const py = bodyY + Math.sin(angle) * (radius * 0.6);

        const grad = ctx.createRadialGradient(px, py, puffRad * 0.2, px, py, puffRad);
        grad.addColorStop(0, woolColor);
        grad.addColorStop(1, woolShadow);
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.arc(px, py, puffRad, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.beginPath();
    ctx.ellipse(0, bodyY, radius * 0.95, radius * 0.85, 0, 0, Math.PI * 2);
    ctx.fillStyle = woolColor;
    ctx.fill();

    // --- FRONT LEGS (Barely Visible Peeking) ---
    drawRealLeg(ctx, -legX, legY, legW, legH, walkCycle, faceColor, hoofColor, false);
    drawRealLeg(ctx, legX, legY, legW, legH, -walkCycle, faceColor, hoofColor, false);

    // --- HEAD (Top View) ---
    // Positioned more "forward" (Negative Y in top-down logic means 'up' canvas, which is 'forward' for Player)
    const headY = bodyY - radius * 0.6;
    const headSize = radius * 0.55;

    // Horns (If Heavy) - Removed, now ears are general.

    // Ears
    ctx.fillStyle = faceColor;
    ctx.beginPath();
    ctx.ellipse(-headSize * 0.8, headY, headSize * 0.4, headSize * 0.8, -0.4, 0, Math.PI * 2);
    ctx.ellipse(headSize * 0.8, headY, headSize * 0.4, headSize * 0.8, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Face Base
    ctx.fillStyle = faceColor;
    ctx.beginPath();
    ctx.arc(0, headY, headSize, 0, Math.PI * 2);
    ctx.fill();

    // Snout (Forward)
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(0, headY - headSize * 0.2, headSize * 0.4, headSize * 0.25, 0, 0, Math.PI * 2); // Snout is "higher" (more forward)
    ctx.fill();

    // Wool Cap
    ctx.fillStyle = woolColor;
    ctx.beginPath();
    ctx.arc(0, headY - headSize * 0.3, headSize * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (Visible from top)
    ctx.fillStyle = '#000';
    const eyeSep = headSize * 0.4;
    const eyeY = headY - headSize * 0.1; // Further back
    ctx.beginPath(); ctx.arc(-eyeSep, eyeY, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeSep, eyeY, 2.5, 0, Math.PI * 2); ctx.fill();

    // Eye Shine
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-eyeSep + 1, eyeY - 1, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeSep + 1, eyeY - 1, 1, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
}

function drawRealLeg(ctx, x, y, w, h, swing, skinColor, hoofColor, isShadow) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(swing * 0.4);

    // Leg
    ctx.fillStyle = isShadow ? shadeColor(skinColor, -20) : skinColor;
    if (isShadow) ctx.filter = 'brightness(0.7)'; // Dim back legs

    ctx.beginPath();
    ctx.roundRect(-w / 2, 0, w, h, w / 3);
    ctx.fill();

    // Hoof
    ctx.fillStyle = hoofColor;
    ctx.beginPath();
    ctx.roundRect(-w / 2, h - w / 2, w, w / 2, 2);
    ctx.fill();

    ctx.restore();
}

function shadeColor(color, percent) {
    // Simple helper for hex shading if needed, or just use filter
    // Since we use hex strings, this function is complex to implement inline.
    // We'll rely on ctx.filter for shadowing which is supported in Canvas context.
    return color;
}

function updateUI() {
    // HP Bars
    const pPct = (state.playerHP / CONFIG.MAX_HP) * 100;
    const bPct = (state.botHP / CONFIG.MAX_HP) * 100;

    document.getElementById('player-hp-fill').style.width = `${Math.max(0, pPct)}%`;
    document.getElementById('player-hp-text').innerText = `${Math.floor(Math.max(0, pPct))}%`;

    document.getElementById('bot-hp-fill').style.width = `${Math.max(0, bPct)}%`;
    document.getElementById('bot-hp-text').innerText = `${Math.floor(Math.max(0, bPct))}%`;

    // Button Cooldown Overlay
    const now = Date.now();
    const cooldownRemaining = Math.max(0, CONFIG.PLAYER_COOLDOWN - (now - state.lastSpawnTime));
    const cdPct = (cooldownRemaining / CONFIG.PLAYER_COOLDOWN) * 100;

    document.querySelectorAll('.unit-btn').forEach(btn => {
        let overlay = btn.querySelector('.cooldown-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'cooldown-overlay';
            btn.appendChild(overlay);
        }

        if (cooldownRemaining > 0) {
            overlay.style.height = `${cdPct}%`;
            btn.classList.add('disabled');
        } else {
            overlay.style.height = '0%';
            btn.classList.remove('disabled');
        }
    });
}

// Start
init();


// --- JUICE SYSTEM HELPERS ---

function spawnParticles(x, y, color, count = 5) {
    for (let i = 0; i < count; i++) {
        state.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 1.0,
            color: color,
            size: Math.random() * 4 + 2
        });
    }
}

function spawnFloater(x, y, text, color) {
    state.floaters.push({
        x: x,
        y: y,
        text: text,
        color: color,
        life: 1.0,
        vy: -1
    });
}

function updateParticles() {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        let p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;
        if (p.life <= 0) state.particles.splice(i, 1);
    }
}

function updateFloaters() {
    for (let i = state.floaters.length - 1; i >= 0; i--) {
        let f = state.floaters[i];
        f.y += f.vy;
        f.life -= 0.02;
        if (f.life <= 0) state.floaters.splice(i, 1);
    }
}
