/**
 * Hago Sheep Fight Clone
 * Vertical Lane Push Mechanic
 */

/* --- Configuration --- */
const CONFIG = {
    LANES: 5,
    FPS: 60,
    BASE_HP: 100,
    MAX_HP: 200,
    PLAYER_COOLDOWN: 0,
};

/* --- LEVEL SYSTEM --- */
const LEVELS = {
    1: { name: 'Training Day', botSpeed: 0.5, botAggro: 0.3, theme: 'light', hp: 100 },
    2: { name: 'Skirmish', botSpeed: 0.8, botAggro: 0.6, theme: 'light', hp: 150 },
    3: { name: 'Blitz', botSpeed: 1.2, botAggro: 0.8, theme: 'desert', hp: 200 }, // Fast
    4: { name: 'Heavy Duty', botSpeed: 0.9, botAggro: 0.7, theme: 'winter', hp: 250, heavyBias: true },
    5: { name: 'Boss Fight', botSpeed: 1.5, botAggro: 1.0, theme: 'dark', hp: 300 }
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
    white_small: new Image(),
    white_medium: new Image(),
    white_heavy: new Image(),
    black_small: new Image(),
    black_medium: new Image(),
    black_heavy: new Image()
};

// Asset Loading Promise
let assetsLoadedCount = 0;
const onAssetLoad = () => {
    assetsLoadedCount++;
    if (assetsLoadedCount >= 6) {
        state.assetsLoaded = true;
        console.log('All assets loaded');
    }
};

assets.white_small.onload = onAssetLoad;
assets.white_medium.onload = onAssetLoad;
assets.white_heavy.onload = onAssetLoad;
assets.black_small.onload = onAssetLoad;
assets.black_medium.onload = onAssetLoad;
assets.black_heavy.onload = onAssetLoad;

assets.white_small.src = 'assets/sheep_white_small.png';
assets.white_medium.src = 'assets/sheep_white_medium.png';
assets.white_heavy.src = 'assets/sheep_white_heavy.png';
assets.black_small.src = 'assets/sheep_black_small.png';
assets.black_medium.src = 'assets/sheep_black_medium.png';
assets.black_heavy.src = 'assets/sheep_black_heavy.png';

// Legacy assets removed to prevent crash

assets.white.src = 'assets/sheep_white.png';
assets.black.src = 'assets/sheep_black.png';

/* --- Game State --- */
let state = {
    running: false,
    paused: false,
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
    shake: 0,       // Screen shake intensity
    // Settings
    volume: 0.5,
    skin: 'default',
    theme: 'light',
    // Inventory System
    inventory: {
        small: 1,
        medium: 1,
        heavy: 1
    },
    botInventory: {
        small: 1,
        medium: 1,
        heavy: 1
    },
    inventoryTimer: 0
};

// Lane Structure: { playerUnits: [], botUnits: [], netPush: 0 }
// Unit Structure: { id, x, y, type, team (0=player, 1=bot), str }

let lastTime = 0;
let botTimer = 0;
let nextUnitId = 0;

/* --- Audio System (Simple) --- */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playClickSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(state.volume * 0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

/* --- Initialization --- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let laneWidth = 0;

function init() {
    console.log("Initializing Game...");

    // Safety Helper
    const safeAddListener = (id, event, cb) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, cb);
        else console.warn(`Element ${id} not found`);
    };

    setupLanes();
    resize();
    window.addEventListener('resize', resize);

    // --- INPUT HANDLING (Touch & Keyboard) ---
    // Touch Logic for Unit Buttons
    document.querySelectorAll('.unit-btn').forEach(btn => {
        const handler = (e) => {
            e.preventDefault();
            selectUnit(btn.dataset.type);
        };
        btn.addEventListener('touchstart', handler, { passive: false });
        btn.addEventListener('click', handler);
    });

    // Touch Logic for Lanes
    document.querySelectorAll('.lane-zone').forEach(zone => {
        const handler = (e) => {
            e.preventDefault();
            spawnPlayerUnit(parseInt(zone.dataset.lane));
        };
        zone.addEventListener('touchstart', handler, { passive: false });
        zone.addEventListener('click', handler);
    });

    // Re-attach Settings Listeners
    safeAddListener('restart-btn', 'click', resetGame);

    // Settings Listeners
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    // Helper for both click and touch
    const addInput = (elem, cb) => {
        if (!elem) return;
        elem.addEventListener('click', cb);
        elem.addEventListener('touchstart', (e) => {
            if (e.cancelable) e.preventDefault();
            cb(e);
        }, { passive: false });
    };

    addInput(settingsBtn, () => {
        state.paused = true;
        if (settingsModal) settingsModal.classList.remove('hidden');
    });

    addInput(closeSettingsBtn, () => {
        state.paused = false;
        if (settingsModal) settingsModal.classList.add('hidden');
    });

    // Sliders & Buttons
    safeAddListener('volume-slider', 'input', (e) => {
        state.volume = parseFloat(e.target.value);
    });

    safeAddListener('brightness-slider', 'input', (e) => {
        const container = document.getElementById('game-container');
        if (container) container.style.filter = `brightness(${e.target.value})`;
    });

    // Skins/Themes
    document.querySelectorAll('.skin-btn').forEach(btn => {
        addInput(btn, () => {
            document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.skin = btn.dataset.skin;
        });
    });

    document.querySelectorAll('.theme-btn').forEach(btn => {
        addInput(btn, () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.theme = btn.dataset.theme;
            if (state.theme === 'dark') document.body.classList.add('dark-mode');
            else document.body.classList.remove('dark-mode');
        });
    });

    // Keyboard Logic
    window.addEventListener('keydown', (e) => {
        if (state.paused || !state.running) return;

        if (e.key === 'q' || e.key === 'Q') selectUnit('small');
        if (e.key === 'w' || e.key === 'W') selectUnit('medium');
        if (e.key === 'e' || e.key === 'E') selectUnit('heavy');

        if (['1', '2', '3', '4', '5'].includes(e.key)) {
            const laneId = parseInt(e.key) - 1;
            spawnPlayerUnit(laneId);
        }
    });

    // --- Navigation Listeners ---
    addInput(document.getElementById('play-btn'), () => {
        console.log("Play Button Clicked");
        showScreen('level-select-screen');
    });

    addInput(document.getElementById('back-home-btn'), () => {
        showScreen('start-screen');
    });

    // Level Selection
    updateLevelGrid(); // Initial render

    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.classList.remove('hidden');

    // Start loop
    requestAnimationFrame(loop);
}

function updateLevelGrid() {
    const grid = document.querySelector('.level-grid');
    grid.innerHTML = ''; // Clear

    const unlocked = parseInt(localStorage.getItem('unlockedLevel') || 1);

    for (let i = 1; i <= 5; i++) {
        const card = document.createElement('div');
        card.className = `level-card ${i <= unlocked ? 'unlocked' : 'locked'}`;
        card.dataset.level = i;

        // Stars (random for now or stored)
        const starCount = localStorage.getItem(`level_${i}_stars`) || 0;
        let starsStr = '';
        for (let s = 0; s < 3; s++) starsStr += s < starCount ? '★' : '☆';

        card.innerHTML = `
            <div class="level-num">${i}</div>
            <div class="stars">${starsStr}</div>
        `;

        card.addEventListener('click', () => {
            if (card.classList.contains('locked')) return;
            startGame(i);
        });

        grid.appendChild(card);
    }
}

function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));

    // Show target if not null (gameplay = null)
    if (screenId) {
        document.getElementById(screenId).classList.remove('hidden');
    }
}

function updateTheme(themeName) {
    document.body.classList.remove('dark-mode', 'theme-desert', 'theme-winter');
    if (themeName === 'dark') document.body.classList.add('dark-mode');
    // Add other theme classes if we define them later
}

function startGame(level) {
    console.log('Starting Level ' + level);
    state.currentLevel = level;

    // Apply Level Config
    const cfg = LEVELS[level];
    if (cfg) {
        state.botSpeedMultiplier = cfg.botSpeed;
        state.botAggro = cfg.botAggro;
        state.botHP = cfg.hp;
        // Apply theme
        updateTheme(cfg.theme);
    }
    state.playerHP = CONFIG.MAX_HP;

    // Hide all screens -> Gameplay
    showScreen(null);
    resetGame();
}

function winLevel() {
    state.winner = 0;
    const current = state.currentLevel || 1;
    const next = current + 1;

    // Save Progress
    const unlocked = parseInt(localStorage.getItem('unlockedLevel') || 1);
    if (next > unlocked && next <= 5) {
        localStorage.setItem('unlockedLevel', next);
    }

    // Save Stars (Mock: 3 stars for win)
    localStorage.setItem(`level_${current}_stars`, 3);

    setTimeout(() => {
        alert('Level Complete! Unlocked Level ' + next);
        showScreen('level-select-screen');
        updateLevelGrid();
    }, 1000);
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
        if (state.running && !state.paused) {
            update(FIXED_STEP);
            updateFloaters();
            updateParticles();

            // Shake Decay
            if (state.shake > 0) state.shake *= 0.9;
            if (state.shake < 0.5) state.shake = 0;
        }
        accumulator -= FIXED_STEP;
    }

    // Always draw? Or only if running?
    // If paused, we still want to draw (maybe dimmed?)
    // Existing code wrapped draw in if(state.running) originally.
    if (state.running) {
        draw();
    }

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
    state.paused = false; // reset pause
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

    // Inventory Replenish Logic (Every 3 seconds)
    state.inventoryTimer += dt;
    if (state.inventoryTimer > 3000) {
        replenishInventory();
        state.inventoryTimer = 0;
    }

    checkGameOver();
}

function replenishInventory() {
    // Random 1 sheep added for PLAYER
    const types = ['small', 'medium', 'heavy'];
    let type = types[Math.floor(Math.random() * types.length)];

    // Cap at 9
    if (state.inventory[type] < 9) {
        state.inventory[type]++;
    }

    // Random 1 sheep added for BOT
    type = types[Math.floor(Math.random() * types.length)];
    if (state.botInventory[type] < 9) {
        state.botInventory[type]++;
    }

    updateUI();
}

function botAction() {
    const types = ['small', 'medium', 'heavy'];

    // Filter available types
    const availableTypes = types.filter(t => state.botInventory[t] > 0);

    if (availableTypes.length === 0) return; // No sheep available

    // Pick random available type
    const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];

    // Consume inventory
    state.botInventory[randomType]--;

    // Pick a random lane
    const randomLane = Math.floor(Math.random() * CONFIG.LANES);

    spawnBotUnit(randomLane, randomType);
}

function spawnPlayerUnit(laneIdx) {
    if (!state.running) return;

    // Cooldown check
    const now = performance.now();
    if (now - (state.lastSpawnTime || 0) < CONFIG.PLAYER_COOLDOWN) return;

    // Inventory Check
    if (state.inventory[state.selectedUnit] <= 0) return;

    state.lastSpawnTime = now;
    state.inventory[state.selectedUnit]--; // Consume 1

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
    // 1. Sort Units by Y position to ensure correct processing order
    // Player: Ascending Y (0 -> Height) - Leader is smallest Y
    lane.playerUnits.sort((a, b) => a.y - b.y);
    // Bot: Descending Y (Height -> 0) - Leader is largest Y
    lane.botUnits.sort((a, b) => b.y - a.y);

    // 2. Identify Leaders
    const pLead = lane.playerUnits[0];
    const bLead = lane.botUnits[0];

    let pPushStr = 0;
    let bPushStr = 0;
    let engaging = false;

    // 3. Resolve Interaction (Head-to-Head)
    if (pLead && bLead) {
        // Distance check
        const dist = Math.abs(pLead.y - bLead.y);
        const minDist = pLead.radius + bLead.radius; // Touch distance

        // Interaction Range (Slightly larger than touch to start fight)
        if (dist < minDist + 10) {
            engaging = true;

            // Calculate Stack Strength (Only connected units)
            pPushStr = calculateStackStrength(lane.playerUnits);
            bPushStr = calculateStackStrength(lane.botUnits);

            // Determine Net Force
            // Net Speed for Leaders
            let moveSpeed = 0;
            if (pPushStr > bPushStr) {
                moveSpeed = -0.5; // Player Wins (Move Up)
            } else if (bPushStr > pPushStr) {
                moveSpeed = 0.5; // Bot Wins (Move Down)
            } else {
                moveSpeed = 0; // Stalemate
                // Juice
                if (Math.random() < 0.3) {
                    spawnParticles((pLead.x + bLead.x) / 2, (pLead.y + bLead.y) / 2, '#fff', 2);
                }
            }

            // Apply to Leaders (They effectively block each other)
            pLead.y += moveSpeed;
            bLead.y += moveSpeed;
        }
    }

    // 4. Update Player Units (Chain Logic)
    for (let i = 0; i < lane.playerUnits.length; i++) {
        let u = lane.playerUnits[i];

        // If Leader and NOT engaging, move freely
        if (i === 0) {
            if (!engaging) {
                u.y -= u.speed * 1.5;
            }
        } else {
            // Follower Logic
            let leader = lane.playerUnits[i - 1];
            let idealDist = u.radius + leader.radius + 5; // +5 buffer
            let currentDist = Math.abs(u.y - leader.y);
            let idealY = leader.y + idealDist;

            if (u.y > idealY) {
                // Gap exists: Run forward to catch up
                // Don't overshoot
                let moveAmount = u.speed * 1.5;
                if (u.y - moveAmount < idealY) {
                    u.y = idealY; // Snap to stack
                } else {
                    u.y -= moveAmount;
                }
            } else {
                // Too close or touching: Stacked
                // Strict collision: Ensure we don't phase through
                if (u.y < idealY) {
                    u.y = idealY;
                }
            }
        }
    }

    // 5. Update Bot Units (Chain Logic)
    for (let i = 0; i < lane.botUnits.length; i++) {
        let u = lane.botUnits[i];

        // If Leader and NOT engaging
        if (i === 0) {
            if (!engaging) {
                u.y += u.speed * 1.5;
            }
        } else {
            // Follower Logic
            let leader = lane.botUnits[i - 1];
            let idealDist = u.radius + leader.radius + 5;
            let idealY = leader.y - idealDist;

            if (u.y < idealY) {
                // Gap exists: Run forward
                let moveAmount = u.speed * 1.5;
                if (u.y + moveAmount > idealY) {
                    u.y = idealY;
                } else {
                    u.y += moveAmount;
                }
            } else {
                // Stacked
                if (u.y > idealY) {
                    u.y = idealY;
                }
            }
        }
    }

    // 6. Base Hit Logic (Cleanup)
    // Player Hitting Top
    for (let i = lane.playerUnits.length - 1; i >= 0; i--) {
        let u = lane.playerUnits[i];
        if (u.y < 10) {
            damageBase(1, u.str);
            spawnParticles(u.x, 10, '#e74c3c', 10);
            state.shake = 5;
            spawnFloater(u.x, 40, `-${u.str}`, '#e74c3c');
            lane.playerUnits.splice(i, 1);
        }
    }
    // Bot Hitting Bottom
    for (let i = lane.botUnits.length - 1; i >= 0; i--) {
        let u = lane.botUnits[i];
        if (u.y > canvas.height - 10) {
            damageBase(0, u.str);
            spawnParticles(u.x, canvas.height - 10, '#f1c40f', 10);
            state.shake = 5;
            spawnFloater(u.x, canvas.height - 40, `-${u.str}`, '#f1c40f');
            lane.botUnits.splice(i, 1);
        }
    }
}

function calculateStackStrength(units) {
    if (!units.length) return 0;

    let totalStr = units[0].str; // Leader always contributes
    for (let i = 1; i < units.length; i++) {
        let u = units[i];
        let prev = units[i - 1];
        let idealDist = u.radius + prev.radius + 15; // Tolerance for "connected"

        // Distance check
        if (Math.abs(u.y - prev.y) <= idealDist) {
            totalStr += u.str;
        } else {
            // Break chain if gap found
            break;
        }
    }
    return totalStr;
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
    // Show ACTIVE Stack Strength (The power currently pushing)
    // Sort first just in case (Draw is called separate from Update)
    const pUnitsSorted = [...lane.playerUnits].sort((a, b) => a.y - b.y);
    const bUnitsSorted = [...lane.botUnits].sort((a, b) => b.y - a.y);

    const pStr = calculateStackStrength(pUnitsSorted);
    const bStr = calculateStackStrength(bUnitsSorted);

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
    // Determine type key based on type object
    // u.type.id should be small/medium/heavy
    let typeKey = u.type.id;
    let teamKey = u.team === 0 ? 'black' : 'white'; // Player=0(Black), Bot=1(White)

    // Construct asset key
    const assetKey = `${teamKey}_${typeKey}`;
    const img = assets[assetKey];

    if (!img) return;

    ctx.save();
    ctx.translate(u.x, u.y);

    // Flip for Bot? Top-down usually doesn't flip Y unless you want them upside down.
    // Bot is Team 1 (Top). Player is Team 0 (Bottom).
    // If images are "From Front", Player's sheep should face UP (their back to camera? No, "From Front" usually means looking AT camera).
    // User asked "face look from front".
    // 3D images generated are front-facing (looking at viewer).
    // Since it's a lane pusher, units usually face each other?
    // Player units move UP. If they look at camera, they are facing "backwards" relative to movement?
    // Or maybe "Front View" means we see their face.
    // Let's draw them upright.

    // Scale
    const scale = u.radius / 25; // Base radius approx 25?
    ctx.scale(scale, scale);

    // Draw Image centered
    // Images are roughly square.
    const size = 60; // Base size
    ctx.drawImage(img, -size / 2, -size / 2, size, size);

    ctx.restore();
}


function updateUI() {
    // HP Bars
    const pPct = (state.playerHP / CONFIG.MAX_HP) * 100;
    const bPct = (state.botHP / CONFIG.MAX_HP) * 100;

    document.getElementById('player-hp-fill').style.width = `${Math.max(0, pPct)}%`;
    document.getElementById('player-hp-text').innerText = `${Math.floor(Math.max(0, pPct))}%`;

    document.getElementById('bot-hp-fill').style.width = `${Math.max(0, bPct)}%`;
    document.getElementById('bot-hp-text').innerText = `${Math.floor(Math.max(0, bPct))}%`;

    // Inventory Badges & Button State
    ['small', 'medium', 'heavy'].forEach(type => {
        const count = state.inventory[type];
        const badge = document.getElementById(`badge-${type}`);
        const btn = document.querySelector(`.unit-btn[data-type="${type}"]`);

        if (badge) badge.innerText = count;

        // Disable Check: Cooldown OR Empty Inventory
        const now = Date.now(); // Using Date.now() for cooldown consistent with existing code? 
        // Wait, existing code used performance.now() in spawn but Date.now() in UI? 
        // Let's stick to simple inventory check mostly.

        // Check Cooldown
        const cooldownRemaining = Math.max(0, CONFIG.PLAYER_COOLDOWN - (performance.now() - (state.lastSpawnTime || 0)));
        const cdPct = (cooldownRemaining / CONFIG.PLAYER_COOLDOWN) * 100;

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
            // Only enable if inventory > 0
            if (count <= 0) {
                btn.classList.add('disabled');
            } else {
                btn.classList.remove('disabled');
            }
        }
    });
}

// Start
// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);


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
