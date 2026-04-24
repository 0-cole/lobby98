// dungeon.js — "Deep Dive" roguelike dungeon crawler
// Turn-based, grid-based, emoji monsters, procedural generation
// Arrow keys / WASD to move, bump into enemies to attack

(function() {
  const TILE = 28;
  const COLS = 28, ROWS = 20;
  const WALL = 0, FLOOR = 1, STAIRS = 2, CHEST = 3;
  const TILE_COLORS = {
    [WALL]: '#1a2a3a',
    [FLOOR]: '#2a3f4f',
    [STAIRS]: '#4a7a3f',
    [CHEST]: '#7a5a2f'
  };

  const MONSTERS = [
    // floor range, emoji, name, hp, atk, xp
    { minFloor:1, maxFloor:3, emoji:'🐀', name:'Rat', hp:2, atk:1, xp:1 },
    { minFloor:1, maxFloor:4, emoji:'🦇', name:'Bat', hp:2, atk:1, xp:1 },
    { minFloor:2, maxFloor:5, emoji:'🕷️', name:'Spider', hp:3, atk:2, xp:2 },
    { minFloor:3, maxFloor:6, emoji:'🐍', name:'Snake', hp:3, atk:2, xp:2 },
    { minFloor:4, maxFloor:7, emoji:'👻', name:'Ghost', hp:4, atk:2, xp:3 },
    { minFloor:5, maxFloor:8, emoji:'🧟', name:'Zombie', hp:5, atk:3, xp:3 },
    { minFloor:6, maxFloor:9, emoji:'💀', name:'Skeleton', hp:5, atk:3, xp:4 },
    { minFloor:7, maxFloor:99, emoji:'🧙', name:'Dark Mage', hp:6, atk:4, xp:5 },
    { minFloor:8, maxFloor:99, emoji:'🐉', name:'Drake', hp:7, atk:4, xp:6 },
    { minFloor:10, maxFloor:99, emoji:'👹', name:'Demon', hp:9, atk:5, xp:8 },
    { minFloor:12, maxFloor:99, emoji:'🐲', name:'Dragon', hp:12, atk:6, xp:12 },
  ];

  const ITEMS = [
    { emoji:'❤️', name:'Health Potion', type:'heal', value:4 },
    { emoji:'❤️', name:'Health Potion', type:'heal', value:4 },
    { emoji:'⚔️', name:'Sword', type:'atk', value:1 },
    { emoji:'🛡️', name:'Shield', type:'def', value:1 },
    { emoji:'💎', name:'Gem', type:'coins', value:5 },
    { emoji:'⭐', name:'Star', type:'fullheal', value:0 },
  ];

  let game = null;

  function newGame() {
    return {
      floor: 1,
      player: { x:0, y:0, hp:20, maxHp:20, atk:3, def:1, emoji:'😎' },
      map: [], entities: [], items: [],
      log: ['You descend into the depths...'],
      kills: 0, coinsCollected: 0, itemsFound: 0,
      gameOver: false, won: false
    };
  }

  // Dungeon generation
  function generateFloor(floor) {
    const map = Array.from({length:ROWS}, () => Array(COLS).fill(WALL));
    const rooms = [];
    const numRooms = 5 + Math.min(floor, 6);

    for (let i = 0; i < numRooms * 3; i++) {
      if (rooms.length >= numRooms) break;
      const w = 4 + Math.floor(Math.random() * 5);
      const h = 3 + Math.floor(Math.random() * 4);
      const x = 1 + Math.floor(Math.random() * (COLS - w - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - h - 2));
      const overlap = rooms.some(r =>
        x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y
      );
      if (overlap) continue;
      rooms.push({x, y, w, h});
      for (let ry = y; ry < y + h; ry++)
        for (let rx = x; rx < x + w; rx++)
          map[ry][rx] = FLOOR;
    }

    // Corridors between rooms
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i-1], b = rooms[i];
      const ax = Math.floor(a.x + a.w/2), ay = Math.floor(a.y + a.h/2);
      const bx = Math.floor(b.x + b.w/2), by = Math.floor(b.y + b.h/2);
      let cx = ax, cy = ay;
      while (cx !== bx) { if (cy >= 0 && cy < ROWS && cx >= 0 && cx < COLS) map[cy][cx] = FLOOR; cx += cx < bx ? 1 : -1; }
      while (cy !== by) { if (cy >= 0 && cy < ROWS && cx >= 0 && cx < COLS) map[cy][cx] = FLOOR; cy += cy < by ? 1 : -1; }
    }

    // Place stairs in the last room
    const lastRoom = rooms[rooms.length - 1];
    const sx = lastRoom.x + Math.floor(lastRoom.w / 2);
    const sy = lastRoom.y + Math.floor(lastRoom.h / 2);
    map[sy][sx] = STAIRS;

    // Place player in first room
    const firstRoom = rooms[0];
    const px = firstRoom.x + Math.floor(firstRoom.w / 2);
    const py = firstRoom.y + Math.floor(firstRoom.h / 2);

    // Place enemies
    const entities = [];
    const eligible = MONSTERS.filter(m => floor >= m.minFloor && floor <= m.maxFloor);
    const numEnemies = 3 + Math.floor(floor * 1.5);
    for (let i = 0; i < numEnemies; i++) {
      const room = rooms[1 + Math.floor(Math.random() * (rooms.length - 1))];
      if (!room) continue;
      const ex = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
      const ey = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
      if (map[ey]?.[ex] !== FLOOR) continue;
      if (ex === px && ey === py) continue;
      if (entities.some(e => e.x === ex && e.y === ey)) continue;
      const template = eligible[Math.floor(Math.random() * eligible.length)];
      const hpBonus = Math.floor(floor / 3);
      entities.push({
        x: ex, y: ey,
        emoji: template.emoji, name: template.name,
        hp: template.hp + hpBonus, maxHp: template.hp + hpBonus,
        atk: template.atk + Math.floor(floor / 5),
        xp: template.xp
      });
    }

    // Place items in random rooms
    const floorItems = [];
    const numItems = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numItems; i++) {
      const room = rooms[Math.floor(Math.random() * rooms.length)];
      const ix = room.x + 1 + Math.floor(Math.random() * Math.max(1, room.w - 2));
      const iy = room.y + 1 + Math.floor(Math.random() * Math.max(1, room.h - 2));
      if (map[iy]?.[ix] !== FLOOR) continue;
      if (ix === px && iy === py) continue;
      if (entities.some(e => e.x === ix && e.y === iy)) continue;
      if (floorItems.some(f => f.x === ix && f.y === iy)) continue;
      const template = ITEMS[Math.floor(Math.random() * ITEMS.length)];
      floorItems.push({ ...template, x: ix, y: iy });
    }

    return { map, entities, items: floorItems, playerStart: {x: px, y: py} };
  }

  function initFloor(g) {
    const data = generateFloor(g.floor);
    g.map = data.map;
    g.entities = data.entities;
    g.items = data.items;
    g.player.x = data.playerStart.x;
    g.player.y = data.playerStart.y;
  }

  function addLog(g, msg) {
    g.log.push(msg);
    if (g.log.length > 6) g.log.shift();
  }

  function movePlayer(g, dx, dy) {
    if (g.gameOver) return;
    const nx = g.player.x + dx;
    const ny = g.player.y + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    if (g.map[ny][nx] === WALL) return;

    // Check for enemy
    const enemy = g.entities.find(e => e.x === nx && e.y === ny && e.hp > 0);
    if (enemy) {
      // Combat: player attacks
      const dmg = Math.max(1, g.player.atk - Math.floor(Math.random() * 2));
      enemy.hp -= dmg;
      addLog(g, `You hit ${enemy.emoji} ${enemy.name} for ${dmg}! (${Math.max(0,enemy.hp)}HP left)`);
      if (enemy.hp <= 0) {
        addLog(g, `${enemy.emoji} ${enemy.name} defeated! +${enemy.xp}xp`);
        g.kills++;
        g.entities = g.entities.filter(e => e !== enemy);
      }
      // Enemy counter-attacks if alive
      if (enemy.hp > 0) {
        const eDmg = Math.max(1, enemy.atk - g.player.def + Math.floor(Math.random() * 2));
        g.player.hp -= eDmg;
        addLog(g, `${enemy.emoji} hits you for ${eDmg}!`);
        if (g.player.hp <= 0) {
          g.player.hp = 0;
          g.gameOver = true;
          addLog(g, '💀 You died!');
          return;
        }
      }
      moveEnemies(g);
      return;
    }

    // Move player
    g.player.x = nx;
    g.player.y = ny;

    // Check for items
    const item = g.items.find(it => it.x === nx && it.y === ny);
    if (item) {
      g.items = g.items.filter(it => it !== item);
      g.itemsFound++;
      if (item.type === 'heal') {
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + item.value);
        addLog(g, `${item.emoji} ${item.name}! +${item.value}HP (${g.player.hp}/${g.player.maxHp})`);
      } else if (item.type === 'fullheal') {
        g.player.hp = g.player.maxHp;
        addLog(g, `${item.emoji} ${item.name}! Full heal! (${g.player.hp}/${g.player.maxHp})`);
      } else if (item.type === 'atk') {
        g.player.atk += item.value;
        addLog(g, `${item.emoji} ${item.name}! ATK is now ${g.player.atk}`);
      } else if (item.type === 'def') {
        g.player.def += item.value;
        addLog(g, `${item.emoji} ${item.name}! DEF is now ${g.player.def}`);
      } else if (item.type === 'coins') {
        g.coinsCollected += item.value;
        addLog(g, `${item.emoji} ${item.name}! +${item.value} bonus coins`);
      }
    }

    // Check for stairs
    if (g.map[ny][nx] === STAIRS) {
      g.floor++;
      addLog(g, `🔽 Descending to floor ${g.floor}...`);
      g.player.hp = Math.min(g.player.maxHp, g.player.hp + 3); // heal a bit between floors
      initFloor(g);
      return;
    }

    moveEnemies(g);
  }

  function moveEnemies(g) {
    for (const e of g.entities) {
      if (e.hp <= 0) continue;
      const dist = Math.abs(e.x - g.player.x) + Math.abs(e.y - g.player.y);
      if (dist > 6) continue; // only move if near player

      // Simple chase AI
      let dx = 0, dy = 0;
      if (Math.random() < 0.7) { // 70% chance to chase, 30% random
        dx = Math.sign(g.player.x - e.x);
        dy = Math.sign(g.player.y - e.y);
        // Prefer the axis with more distance
        if (Math.abs(g.player.x - e.x) > Math.abs(g.player.y - e.y)) dy = 0;
        else dx = 0;
      } else {
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        const d = dirs[Math.floor(Math.random() * 4)];
        dx = d[0]; dy = d[1];
      }

      const nx = e.x + dx, ny = e.y + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (g.map[ny][nx] === WALL) continue;
      if (g.entities.some(o => o !== e && o.x === nx && o.y === ny)) continue;

      // If moving into player, attack
      if (nx === g.player.x && ny === g.player.y) {
        const eDmg = Math.max(1, e.atk - g.player.def + Math.floor(Math.random() * 2));
        g.player.hp -= eDmg;
        addLog(g, `${e.emoji} ${e.name} hits you for ${eDmg}!`);
        if (g.player.hp <= 0) {
          g.player.hp = 0;
          g.gameOver = true;
          addLog(g, '💀 You died!');
        }
        continue;
      }

      e.x = nx; e.y = ny;
    }
  }

  function calcCoins(g) {
    return Math.min(100, (g.floor - 1) * 5 + g.kills * 2 + g.coinsCollected);
  }

  // ============ RENDERING ============
  function render(canvas, g) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw map
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const tile = g.map[y]?.[x] ?? WALL;
        ctx.fillStyle = TILE_COLORS[tile] || TILE_COLORS[WALL];
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        // Wall edge highlight
        if (tile === WALL) {
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          ctx.fillRect(x * TILE, y * TILE, TILE, 1);
          ctx.fillRect(x * TILE, y * TILE, 1, TILE);
        }
        // Stairs indicator
        if (tile === STAIRS) {
          ctx.fillStyle = 'rgba(255,255,100,0.15)';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          ctx.font = `${TILE - 6}px serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('🔽', x * TILE + TILE/2, y * TILE + TILE/2);
        }
      }
    }

    // Draw items
    for (const item of g.items) {
      ctx.font = `${TILE - 8}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(item.emoji, item.x * TILE + TILE/2, item.y * TILE + TILE/2);
    }

    // Draw entities
    for (const e of g.entities) {
      if (e.hp <= 0) continue;
      ctx.font = `${TILE - 6}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.emoji, e.x * TILE + TILE/2, e.y * TILE + TILE/2);
      // HP bar
      const hpPct = e.hp / e.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x * TILE + 2, e.y * TILE - 3, TILE - 4, 3);
      ctx.fillStyle = hpPct > 0.5 ? '#4caf50' : hpPct > 0.25 ? '#f5a623' : '#e04858';
      ctx.fillRect(e.x * TILE + 2, e.y * TILE - 3, (TILE - 4) * hpPct, 3);
    }

    // Draw player
    ctx.font = `${TILE - 4}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(g.player.emoji, g.player.x * TILE + TILE/2, g.player.y * TILE + TILE/2);
    // Player glow
    ctx.shadowColor = 'rgba(100, 200, 255, 0.4)';
    ctx.shadowBlur = 10;
    ctx.fillText(g.player.emoji, g.player.x * TILE + TILE/2, g.player.y * TILE + TILE/2);
    ctx.shadowBlur = 0;
  }

  // ============ PUBLIC API ============
  window.DungeonGame = {
    _keyHandler: null,
    _game: null,

    init(container, onFinish) {
      game = newGame();
      this._game = game;
      initFloor(game);

      container.innerHTML = `
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
          <div>
            <canvas id="dg-canvas" width="${COLS*TILE}" height="${ROWS*TILE}" style="display:block;border-radius:12px;background:#0a1520;box-shadow:inset 3px 3px 8px rgba(0,0,0,0.4),0 6px 20px rgba(0,0,0,0.3)"></canvas>
            <p style="text-align:center;font-size:12px;color:var(--ink3);margin-top:6px">Arrow keys / WASD to move · Bump enemies to attack</p>
          </div>
          <div style="min-width:200px;flex:1">
            <div id="dg-stats" style="padding:12px;background:var(--neo);border-radius:12px;margin-bottom:10px;box-shadow:inset 2px 2px 4px rgba(30,80,110,0.1),inset -2px -2px 4px rgba(255,255,255,0.9)"></div>
            <div id="dg-log" style="padding:12px;background:var(--neo);border-radius:12px;font-size:13px;color:var(--ink2);line-height:1.5;min-height:120px;box-shadow:inset 2px 2px 4px rgba(30,80,110,0.1),inset -2px -2px 4px rgba(255,255,255,0.9)"></div>
          </div>
        </div>
        <div id="dg-end" style="text-align:center;margin-top:14px" hidden></div>
      `;

      const canvas = document.getElementById('dg-canvas');
      const statsEl = document.getElementById('dg-stats');
      const logEl = document.getElementById('dg-log');
      const endEl = document.getElementById('dg-end');

      function updateUI() {
        const p = game.player;
        const hpBar = `${'█'.repeat(Math.ceil(p.hp/p.maxHp*10))}${'░'.repeat(10-Math.ceil(p.hp/p.maxHp*10))}`;
        statsEl.innerHTML = `
          <div style="font-weight:800;font-size:16px;color:var(--deep);margin-bottom:8px">Floor ${game.floor}</div>
          <div style="font-size:14px;margin-bottom:4px">❤️ HP: ${p.hp}/${p.maxHp} <span style="font-family:monospace;letter-spacing:-1px">${hpBar}</span></div>
          <div style="font-size:14px;margin-bottom:4px">⚔️ ATK: ${p.atk} · 🛡️ DEF: ${p.def}</div>
          <div style="font-size:14px;margin-bottom:4px">💀 Kills: ${game.kills} · 🪙 Coins: ${calcCoins(game)}</div>
          <div style="font-size:13px;color:var(--ink3)">Enemies left: ${game.entities.filter(e=>e.hp>0).length}</div>
        `;
        logEl.innerHTML = game.log.map(l => `<div>${l}</div>`).join('');
        render(canvas, game);

        if (game.gameOver) {
          const coins = calcCoins(game);
          endEl.hidden = false;
          endEl.innerHTML = `
            <div style="padding:16px;background:var(--neo);border-radius:14px;display:inline-block">
              <div style="font-weight:800;font-size:20px;color:var(--danger);margin-bottom:6px">💀 You Died on Floor ${game.floor}</div>
              <div style="font-size:15px;color:var(--ink2)">Kills: ${game.kills} · Items: ${game.itemsFound}</div>
              <div style="font-weight:800;font-size:18px;color:var(--warn);margin:8px 0">🪙 ${coins} coins earned</div>
              <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
                <button class="btn btn-ghost btn-sm" id="dg-back">← Back</button>
                <button class="btn btn-primary" id="dg-retry">Try Again</button>
              </div>
            </div>
          `;
          document.getElementById('dg-back').addEventListener('click', () => {
            cleanup();
            document.getElementById('dg-play-area').hidden = true;
            document.getElementById('dg-menu').hidden = false;
          });
          document.getElementById('dg-retry').addEventListener('click', () => {
            container.innerHTML = '';
            window.DungeonGame.init(container, onFinish);
          });
          onFinish(coins, game.floor, game.kills);
        }
      }

      const cleanup = () => {
        if (this._keyHandler) {
          document.removeEventListener('keydown', this._keyHandler);
          this._keyHandler = null;
        }
      };

      this._keyHandler = (e) => {
        if (game.gameOver) return;
        const key = e.key.toLowerCase();
        let dx = 0, dy = 0;
        if (['arrowup','w'].includes(key)) { dy = -1; e.preventDefault(); }
        else if (['arrowdown','s'].includes(key)) { dy = 1; e.preventDefault(); }
        else if (['arrowleft','a'].includes(key)) { dx = -1; e.preventDefault(); }
        else if (['arrowright','d'].includes(key)) { dx = 1; e.preventDefault(); }
        if (dx || dy) { movePlayer(game, dx, dy); updateUI(); }
      };
      document.addEventListener('keydown', this._keyHandler);
      updateUI();
    },

    cleanup() {
      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = null;
      }
    }
  };
})();
