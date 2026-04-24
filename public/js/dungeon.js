// dungeon.js — "Deep Dive" — auto-battler RPG inspired by Three Goblets
// Area-based progression, timer combat, click-to-target, equipment, loot drops
(function() {
  const W = 720, H = 440;

  // === DATA ===
  const AREAS = [
    { name:"Mossy Caverns", emoji:"🌿", color:"#2d5a1e", floors:5, monsterPool:["slime","bat","rat"], bossPool:["mushroom_king"], unlock:0 },
    { name:"Frozen Depths", emoji:"❄️", color:"#1e4a6a", floors:6, monsterPool:["ice_slime","frost_bat","snowfox"], bossPool:["ice_golem"], unlock:1 },
    { name:"Scorched Halls", emoji:"🔥", color:"#6a2a1a", floors:7, monsterPool:["fire_imp","lava_snake","ember_skull"], bossPool:["inferno_drake"], unlock:2 },
    { name:"Shadow Ruins", emoji:"👁️", color:"#2a1a3a", floors:8, monsterPool:["phantom","dark_mage","shadow_wolf"], bossPool:["void_lord"], unlock:3 },
    { name:"The Abyss", emoji:"💀", color:"#1a0a1a", floors:10, monsterPool:["demon","bone_dragon","lich"], bossPool:["the_ancient"], unlock:4 },
  ];

  const MONSTERS = {
    slime:       { name:"Slime",       emoji:"🟢", hp:12, atk:2, spd:70, xp:2, tier:1 },
    bat:         { name:"Bat",         emoji:"🦇", hp:8,  atk:3, spd:50, xp:2, tier:1 },
    rat:         { name:"Rat",         emoji:"🐀", hp:10, atk:2, spd:55, xp:1, tier:1 },
    mushroom_king:{ name:"Mushroom King",emoji:"🍄", hp:40, atk:5, spd:80, xp:10, tier:1, boss:true },
    ice_slime:   { name:"Ice Slime",   emoji:"🔵", hp:18, atk:3, spd:65, xp:3, tier:2 },
    frost_bat:   { name:"Frost Bat",   emoji:"🧊", hp:14, atk:4, spd:45, xp:3, tier:2 },
    snowfox:     { name:"Snow Fox",    emoji:"🦊", hp:16, atk:4, spd:40, xp:4, tier:2 },
    ice_golem:   { name:"Ice Golem",   emoji:"🗿", hp:60, atk:7, spd:90, xp:15, tier:2, boss:true },
    fire_imp:    { name:"Fire Imp",    emoji:"😈", hp:22, atk:5, spd:50, xp:5, tier:3 },
    lava_snake:  { name:"Lava Snake",  emoji:"🐍", hp:20, atk:6, spd:45, xp:5, tier:3 },
    ember_skull: { name:"Ember Skull", emoji:"💀", hp:25, atk:5, spd:55, xp:6, tier:3 },
    inferno_drake:{ name:"Inferno Drake",emoji:"🐉", hp:90, atk:10, spd:70, xp:25, tier:3, boss:true },
    phantom:     { name:"Phantom",     emoji:"👻", hp:30, atk:7, spd:40, xp:8, tier:4 },
    dark_mage:   { name:"Dark Mage",   emoji:"🧙", hp:28, atk:9, spd:50, xp:9, tier:4 },
    shadow_wolf: { name:"Shadow Wolf", emoji:"🐺", hp:35, atk:8, spd:35, xp:8, tier:4 },
    void_lord:   { name:"Void Lord",   emoji:"👁️", hp:130, atk:14, spd:60, xp:40, tier:4, boss:true },
    demon:       { name:"Demon",       emoji:"👹", hp:45, atk:12, spd:45, xp:12, tier:5 },
    bone_dragon: { name:"Bone Dragon", emoji:"🐲", hp:50, atk:11, spd:50, xp:14, tier:5 },
    lich:        { name:"Lich",        emoji:"☠️", hp:40, atk:14, spd:40, xp:13, tier:5 },
    the_ancient: { name:"The Ancient", emoji:"⚫", hp:200, atk:18, spd:55, xp:80, tier:5, boss:true },
  };

  const LOOT_TABLE = [
    { name:"Rusty Sword",   emoji:"⚔️", slot:"weapon", atk:2, def:0, spd:0, tier:1 },
    { name:"Wooden Shield",  emoji:"🛡️", slot:"armor",  atk:0, def:2, spd:0, tier:1 },
    { name:"Swift Ring",     emoji:"💍", slot:"ring",   atk:0, def:0, spd:-8, tier:1 },
    { name:"Iron Blade",     emoji:"🗡️", slot:"weapon", atk:4, def:0, spd:0, tier:2 },
    { name:"Chain Mail",     emoji:"🛡️", slot:"armor",  atk:0, def:4, spd:5, tier:2 },
    { name:"Ruby Ring",      emoji:"💎", slot:"ring",   atk:2, def:1, spd:-5, tier:2 },
    { name:"Flame Sword",    emoji:"🔥", slot:"weapon", atk:7, def:0, spd:-3, tier:3 },
    { name:"Dragon Armor",   emoji:"🐉", slot:"armor",  atk:1, def:7, spd:8, tier:3 },
    { name:"Shadow Amulet",  emoji:"🌑", slot:"ring",   atk:3, def:2, spd:-10, tier:3 },
    { name:"Void Edge",      emoji:"⚫", slot:"weapon", atk:12, def:0, spd:-5, tier:4 },
    { name:"Titan Plate",    emoji:"🏛️", slot:"armor",  atk:0, def:12, spd:10, tier:4 },
    { name:"Starlight Band", emoji:"⭐", slot:"ring",   atk:5, def:5, spd:-15, tier:4 },
    { name:"Health Potion",  emoji:"❤️", slot:"potion", heal:15, tier:1 },
    { name:"Greater Potion", emoji:"💗", slot:"potion", heal:30, tier:2 },
    { name:"Full Restore",   emoji:"💖", slot:"potion", heal:999, tier:3 },
  ];

  // === GAME STATE ===
  let g = null;
  let _raf = null;
  let _particles = [];

  function newGame() {
    return {
      screen: "world", // "world" | "battle" | "victory" | "defeat" | "inventory"
      player: { hp:30, maxHp:30, baseAtk:4, baseDef:1, baseSpd:55, xp:0, level:1, atkTimer:0, target:0 },
      equipment: { weapon:null, armor:null, ring:null },
      inventory: [], // up to 8 items
      area: null, floor: 0,
      enemies: [],
      areasCleared: 0,
      totalKills: 0, totalCoins: 0,
      log: []
    };
  }

  function getPlayerStats(g) {
    let atk = g.player.baseAtk, def = g.player.baseDef, spd = g.player.baseSpd;
    for (const slot of ["weapon","armor","ring"]) {
      const item = g.equipment[slot];
      if (item) { atk += item.atk || 0; def += item.def || 0; spd += item.spd || 0; }
    }
    atk += Math.floor(g.player.level * 1.5);
    return { atk, def, spd: Math.max(15, spd) };
  }

  function xpToLevel(level) { return level * level * 8 + 10; }

  function addLog(msg) { g.log.unshift(msg); if (g.log.length > 8) g.log.pop(); }

  // === ENCOUNTER GENERATION ===
  function startArea(areaIdx) {
    const area = AREAS[areaIdx];
    g.area = areaIdx; g.floor = 0;
    startFloor();
  }

  function startFloor() {
    const area = AREAS[g.area];
    const isBoss = g.floor === area.floors - 1;
    g.enemies = [];
    if (isBoss) {
      const key = area.bossPool[Math.floor(Math.random() * area.bossPool.length)];
      const m = { ...MONSTERS[key] };
      m.hp = m.hp; m.maxHp = m.hp; m.atkTimer = m.spd; m.dmgFlash = 0;
      g.enemies.push(m);
    } else {
      const count = 1 + Math.floor(Math.random() * 2) + (g.floor > 3 ? 1 : 0);
      for (let i = 0; i < Math.min(count, 3); i++) {
        const key = area.monsterPool[Math.floor(Math.random() * area.monsterPool.length)];
        const m = { ...MONSTERS[key] };
        const scale = 1 + g.floor * 0.15;
        m.hp = Math.ceil(m.hp * scale); m.maxHp = m.hp;
        m.atk = Math.ceil(m.atk * scale);
        m.atkTimer = m.spd + Math.random() * 30;
        m.dmgFlash = 0;
        g.enemies.push(m);
      }
    }
    g.player.atkTimer = getPlayerStats(g).spd;
    g.player.target = 0;
    addLog(`Floor ${g.floor + 1}/${AREAS[g.area].floors} — ${g.enemies.map(e => e.emoji).join(" ")}`);
  }

  // === COMBAT ===
  function updateBattle(dt) {
    if (g.screen !== "battle") return;
    const stats = getPlayerStats(g);

    // Player attack timer
    g.player.atkTimer -= dt;
    if (g.player.atkTimer <= 0) {
      g.player.atkTimer = stats.spd;
      const alive = g.enemies.filter(e => e.hp > 0);
      if (alive.length > 0) {
        const target = alive[Math.min(g.player.target, alive.length - 1)];
        const dmg = Math.max(1, stats.atk + Math.floor(Math.random() * 3) - 1);
        target.hp = Math.max(0, target.hp - dmg);
        target.dmgFlash = 12;
        addParticle(target, `-${dmg}`, '#ff6b6b');

        if (target.hp <= 0) {
          addLog(`${target.emoji} ${target.name} defeated!`);
          g.totalKills++;
          g.player.xp += target.xp;
          // Level up check
          while (g.player.xp >= xpToLevel(g.player.level)) {
            g.player.xp -= xpToLevel(g.player.level);
            g.player.level++;
            g.player.maxHp += 5;
            g.player.hp = g.player.maxHp;
            g.player.baseAtk += 1;
            addLog(`⬆️ Level ${g.player.level}!`);
          }
          // Loot drop
          if (Math.random() < (target.boss ? 1 : 0.35)) {
            const eligible = LOOT_TABLE.filter(l => l.tier <= (g.area || 0) + 1);
            const drop = eligible[Math.floor(Math.random() * eligible.length)];
            if (drop && g.inventory.length < 8) {
              g.inventory.push({ ...drop });
              addLog(`${drop.emoji} Found: ${drop.name}!`);
            }
          }
          // Retarget
          const newAlive = g.enemies.filter(e => e.hp > 0);
          if (newAlive.length === 0) {
            floorCleared();
            return;
          }
          g.player.target = Math.min(g.player.target, newAlive.length - 1);
        }
      }
    }

    // Enemy attacks
    g.enemies.forEach(e => {
      if (e.hp <= 0) return;
      e.atkTimer -= dt;
      e.dmgFlash = Math.max(0, e.dmgFlash - dt * 0.5);
      if (e.atkTimer <= 0) {
        e.atkTimer = e.spd;
        const dmg = Math.max(1, e.atk - stats.def + Math.floor(Math.random() * 2));
        g.player.hp = Math.max(0, g.player.hp - dmg);
        addParticle({ _px: W/2, _py: H - 80 }, `-${dmg}`, '#ffd700');
        if (g.player.hp <= 0) {
          g.screen = "defeat";
          addLog("💀 You were defeated!");
        }
      }
    });
  }

  function floorCleared() {
    const area = AREAS[g.area];
    g.floor++;
    g.player.hp = Math.min(g.player.maxHp, g.player.hp + Math.ceil(g.player.maxHp * 0.2));
    if (g.floor >= area.floors) {
      g.screen = "victory";
      g.areasCleared = Math.max(g.areasCleared, g.area + 1);
      g.totalCoins += (g.area + 1) * 10;
      addLog(`🏆 ${area.name} cleared!`);
    } else {
      startFloor();
    }
  }

  // === PARTICLES ===
  function addParticle(entity, text, color) {
    const px = entity._px || 0, py = entity._py || 0;
    _particles.push({ x: px + (Math.random()-0.5)*20, y: py - 10, text, color, born: Date.now(), life: 700 });
  }

  // === RENDERING ===
  function render(ctx) {
    ctx.clearRect(0, 0, W, H);

    if (g.screen === "world") renderWorld(ctx);
    else if (g.screen === "battle") renderBattle(ctx);
    else if (g.screen === "victory") renderEndScreen(ctx, "🏆 Area Cleared!", "#4caf50");
    else if (g.screen === "defeat") renderEndScreen(ctx, "💀 Defeated!", "#e04858");
    else if (g.screen === "inventory") renderInventory(ctx);

    // Particles (always render)
    const now = Date.now();
    _particles = _particles.filter(p => {
      const age = now - p.born;
      if (age > p.life) return false;
      const prog = age / p.life;
      ctx.globalAlpha = 1 - prog;
      ctx.fillStyle = p.color;
      ctx.font = `bold ${16 + (1-prog)*6}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y - prog * 35);
      ctx.globalAlpha = 1;
      return true;
    });
  }

  function renderWorld(ctx) {
    // Background
    ctx.fillStyle = '#0e1a24';
    ctx.fillRect(0, 0, W, H);
    // Title
    ctx.fillStyle = '#8ec8e8';
    ctx.font = 'bold 22px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚔️ Deep Dive — World Map', W/2, 35);
    // Player stats bar
    ctx.font = '14px Nunito, sans-serif';
    ctx.fillStyle = '#aac8d8';
    ctx.fillText(`Lv.${g.player.level} | HP: ${g.player.hp}/${g.player.maxHp} | Kills: ${g.totalKills} | Coins: ${g.totalCoins}`, W/2, 58);
    // Area cards
    AREAS.forEach((area, i) => {
      const x = 40 + (i % 3) * 230, y = 80 + Math.floor(i / 3) * 150;
      const unlocked = i <= g.areasCleared;
      const cleared = i < g.areasCleared;
      ctx.fillStyle = unlocked ? area.color : '#1a1a2a';
      ctx.globalAlpha = unlocked ? 1 : 0.4;
      roundRect(ctx, x, y, 200, 120, 12);
      ctx.fill();
      // Glow for current area
      if (unlocked && !cleared) {
        ctx.strokeStyle = '#8ec8e8'; ctx.lineWidth = 2;
        roundRect(ctx, x, y, 200, 120, 12); ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.font = '28px serif'; ctx.textAlign = 'center';
      ctx.fillText(area.emoji, x + 100, y + 45);
      ctx.font = 'bold 15px Nunito, sans-serif';
      ctx.fillText(area.name, x + 100, y + 72);
      ctx.font = '12px Nunito, sans-serif';
      ctx.fillStyle = cleared ? '#4caf50' : '#aaa';
      ctx.fillText(cleared ? '✓ Cleared' : unlocked ? `${area.floors} floors` : '🔒 Locked', x + 100, y + 92);
      ctx.globalAlpha = 1;
      // Store rect for click detection
      area._rect = { x, y, w: 200, h: 120, idx: i };
    });
    // Inventory button
    ctx.fillStyle = '#2a3a4a';
    roundRect(ctx, W - 120, H - 50, 100, 36, 8); ctx.fill();
    ctx.fillStyle = '#8ec8e8'; ctx.font = '14px Nunito, sans-serif';
    ctx.fillText('🎒 Inventory', W - 70, H - 28);
  }

  function renderBattle(ctx) {
    const area = AREAS[g.area];
    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, area.color); grad.addColorStop(1, '#0a0a14');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // Floor indicator
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Nunito, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`${area.emoji} ${area.name} — Floor ${g.floor + 1}/${area.floors}`, 16, 24);
    // Player info (bottom)
    const stats = getPlayerStats(g);
    const hpPct = g.player.hp / g.player.maxHp;
    // HP bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, 20, H - 60, 200, 22, 6); ctx.fill();
    ctx.fillStyle = hpPct > 0.5 ? '#4caf50' : hpPct > 0.25 ? '#f5a623' : '#e04858';
    roundRect(ctx, 20, H - 60, 200 * hpPct, 22, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`HP: ${g.player.hp}/${g.player.maxHp}`, 120, H - 44);
    // Stats
    ctx.textAlign = 'left'; ctx.font = '12px Nunito, sans-serif'; ctx.fillStyle = '#aac8d8';
    ctx.fillText(`Lv.${g.player.level} | ATK:${stats.atk} DEF:${stats.def} SPD:${stats.spd}`, 20, H - 28);
    // Attack timer bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, 20, H - 18, 200, 8, 4); ctx.fill();
    ctx.fillStyle = '#8ec8e8';
    roundRect(ctx, 20, H - 18, 200 * (1 - g.player.atkTimer / stats.spd), 8, 4); ctx.fill();
    // XP bar
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, 240, H - 18, 120, 8, 4); ctx.fill();
    ctx.fillStyle = '#a78bfa';
    roundRect(ctx, 240, H - 18, 120 * (g.player.xp / xpToLevel(g.player.level)), 8, 4); ctx.fill();
    ctx.font = '10px Nunito, sans-serif'; ctx.fillStyle = '#a78bfa'; ctx.textAlign = 'left';
    ctx.fillText(`XP: ${g.player.xp}/${xpToLevel(g.player.level)}`, 240, H - 24);

    // Enemies
    const alive = g.enemies.filter(e => e.hp > 0);
    alive.forEach((e, i) => {
      const ex = W/2 + (i - (alive.length-1)/2) * 140;
      const ey = 100 + (e.boss ? 0 : 20);
      const size = e.boss ? 60 : 44;
      e._px = ex; e._py = ey;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(ex, ey + size/2 + 8, size/2, 8, 0, 0, Math.PI*2); ctx.fill();
      // Monster body (flash white on damage)
      const flashAlpha = e.dmgFlash / 12;
      ctx.font = `${size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.emoji, ex, ey);
      if (flashAlpha > 0) {
        ctx.globalAlpha = flashAlpha * 0.6;
        ctx.fillStyle = '#fff';
        ctx.fillRect(ex - size/2, ey - size/2, size, size);
        ctx.globalAlpha = 1;
      }
      // HP bar
      const barW = size + 20, barH = 6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, ex - barW/2, ey + size/2 + 4, barW, barH, 3); ctx.fill();
      const hpP = e.hp / e.maxHp;
      ctx.fillStyle = hpP > 0.5 ? '#4caf50' : hpP > 0.25 ? '#f5a623' : '#e04858';
      roundRect(ctx, ex - barW/2, ey + size/2 + 4, barW * hpP, barH, 3); ctx.fill();
      // Name + HP text
      ctx.fillStyle = '#ddd'; ctx.font = '11px Nunito, sans-serif'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${e.name} ${e.hp}/${e.maxHp}`, ex, ey + size/2 + 22);
      // Attack timer
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, ex - barW/2, ey + size/2 + 26, barW, 4, 2); ctx.fill();
      ctx.fillStyle = '#ff8888';
      roundRect(ctx, ex - barW/2, ey + size/2 + 26, barW * (1 - e.atkTimer / e.spd), 4, 2); ctx.fill();
      // Target indicator
      const isTarget = (g.player.target === i || (g.player.target >= alive.length && i === alive.length - 1));
      if (isTarget) {
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey - size/2 - 8, 6, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = '#ffd700'; ctx.font = '10px Nunito, sans-serif';
        ctx.fillText('▼', ex, ey - size/2 - 14);
      }
      // Store click rect
      e._clickRect = { x: ex - size/2 - 10, y: ey - size/2 - 10, w: size + 20, h: size + 40 };
    });

    // Player character (bottom center)
    ctx.font = '36px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('😎', W/2, H - 100);

    // Log
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.font = '11px Nunito, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    g.log.slice(0, 5).forEach((msg, i) => {
      ctx.globalAlpha = 1 - i * 0.18;
      ctx.fillText(msg, W - 16, 24 + i * 16);
    });
    ctx.globalAlpha = 1;

    // Flee button
    ctx.fillStyle = 'rgba(224,72,88,0.3)';
    roundRect(ctx, W - 80, H - 50, 64, 28, 6); ctx.fill();
    ctx.fillStyle = '#ff8888'; ctx.font = '12px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Flee', W - 48, H - 32);

    // Potion button
    const potions = g.inventory.filter(it => it.slot === 'potion');
    if (potions.length > 0) {
      ctx.fillStyle = 'rgba(76,175,80,0.3)';
      roundRect(ctx, W - 160, H - 50, 72, 28, 6); ctx.fill();
      ctx.fillStyle = '#8f8'; ctx.font = '12px Nunito, sans-serif';
      ctx.fillText(`❤️ Potion (${potions.length})`, W - 124, H - 32);
    }
  }

  function renderEndScreen(ctx, title, color) {
    ctx.fillStyle = '#0e1a24'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color; ctx.font = 'bold 28px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(title, W/2, H/2 - 40);
    ctx.fillStyle = '#aac8d8'; ctx.font = '16px Nunito, sans-serif';
    ctx.fillText(`Level ${g.player.level} | Kills: ${g.totalKills} | Coins: ${g.totalCoins}`, W/2, H/2);
    // Buttons
    ctx.fillStyle = '#2a4a3a'; roundRect(ctx, W/2 - 110, H/2 + 30, 100, 36, 8); ctx.fill();
    ctx.fillStyle = '#8f8'; ctx.font = '14px Nunito, sans-serif'; ctx.fillText('Continue', W/2 - 60, H/2 + 53);
    ctx.fillStyle = '#4a2a2a'; roundRect(ctx, W/2 + 10, H/2 + 30, 100, 36, 8); ctx.fill();
    ctx.fillStyle = '#f88'; ctx.fillText('Cash Out', W/2 + 60, H/2 + 53);
  }

  function renderInventory(ctx) {
    ctx.fillStyle = '#0e1a24'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#8ec8e8'; ctx.font = 'bold 20px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🎒 Inventory & Equipment', W/2, 32);

    // Equipment slots
    const slots = [
      { key: "weapon", label: "Weapon", x: 60, y: 60 },
      { key: "armor",  label: "Armor",  x: 60, y: 140 },
      { key: "ring",   label: "Ring",   x: 60, y: 220 },
    ];
    slots.forEach(s => {
      const item = g.equipment[s.key];
      ctx.fillStyle = '#1a2a3a';
      roundRect(ctx, s.x, s.y, 180, 60, 10); ctx.fill();
      ctx.strokeStyle = item ? '#4caf50' : '#3a4a5a'; ctx.lineWidth = 1;
      roundRect(ctx, s.x, s.y, 180, 60, 10); ctx.stroke();
      ctx.fillStyle = '#6a8a9a'; ctx.font = '11px Nunito, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(s.label, s.x + 10, s.y + 16);
      if (item) {
        ctx.fillStyle = '#fff'; ctx.font = '14px Nunito, sans-serif';
        ctx.fillText(`${item.emoji} ${item.name}`, s.x + 10, s.y + 36);
        ctx.fillStyle = '#aaa'; ctx.font = '11px Nunito, sans-serif';
        const stats = [item.atk ? `ATK+${item.atk}` : '', item.def ? `DEF+${item.def}` : '', item.spd ? `SPD${item.spd > 0 ? '+' : ''}${item.spd}` : ''].filter(Boolean).join(' ');
        ctx.fillText(stats, s.x + 10, s.y + 52);
      } else {
        ctx.fillStyle = '#4a5a6a'; ctx.font = '13px Nunito, sans-serif';
        ctx.fillText('(empty)', s.x + 10, s.y + 40);
      }
      s._rect = { x: s.x, y: s.y, w: 180, h: 60 };
    });

    // Inventory grid
    ctx.fillStyle = '#8ec8e8'; ctx.font = 'bold 14px Nunito, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Items (click to equip, right-click to discard)', 290, 72);
    g.inventory.forEach((item, i) => {
      const ix = 290 + (i % 4) * 100, iy = 85 + Math.floor(i / 4) * 75;
      ctx.fillStyle = '#1a2a3a'; roundRect(ctx, ix, iy, 90, 65, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '20px serif'; ctx.textAlign = 'center';
      ctx.fillText(item.emoji, ix + 45, iy + 28);
      ctx.fillStyle = '#ccc'; ctx.font = '10px Nunito, sans-serif';
      ctx.fillText(item.name, ix + 45, iy + 48);
      if (item.slot !== 'potion') {
        ctx.fillStyle = '#888'; ctx.font = '9px Nunito, sans-serif';
        const s = [item.atk ? `A+${item.atk}` : '', item.def ? `D+${item.def}` : ''].filter(Boolean).join(' ');
        ctx.fillText(s, ix + 45, iy + 60);
      } else {
        ctx.fillStyle = '#4caf50'; ctx.font = '9px Nunito, sans-serif';
        ctx.fillText(`Heal ${item.heal}`, ix + 45, iy + 60);
      }
      item._rect = { x: ix, y: iy, w: 90, h: 65 };
    });

    // Back button
    ctx.fillStyle = '#2a3a4a'; roundRect(ctx, 20, H - 50, 80, 32, 8); ctx.fill();
    ctx.fillStyle = '#8ec8e8'; ctx.font = '13px Nunito, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('← Back', 60, H - 30);

    // Player stats
    const stats = getPlayerStats(g);
    ctx.textAlign = 'left'; ctx.fillStyle = '#aac8d8'; ctx.font = '13px Nunito, sans-serif';
    ctx.fillText(`Lv.${g.player.level} | ATK:${stats.atk} DEF:${stats.def} SPD:${stats.spd} | HP:${g.player.hp}/${g.player.maxHp}`, 290, H - 30);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();
  }

  // === PUBLIC API ===
  window.DungeonGame = {
    _keyHandler: null,

    init(container, onFinish) {
      g = newGame();
      _particles = [];

      container.innerHTML = `<canvas id="dg-canvas" width="${W}" height="${H}" style="display:block;margin:0 auto;border-radius:14px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,0.3)"></canvas>`;
      const canvas = document.getElementById('dg-canvas');
      const ctx = canvas.getContext('2d');

      // Click handler
      const onClick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (W / rect.width);
        const my = (e.clientY - rect.top) * (H / rect.height);

        if (g.screen === "world") {
          // Check area clicks
          AREAS.forEach((area, i) => {
            if (i <= g.areasCleared && area._rect) {
              const r = area._rect;
              if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
                startArea(i);
                g.screen = "battle";
              }
            }
          });
          // Inventory button
          if (mx >= W-120 && mx <= W-20 && my >= H-50 && my <= H-14) {
            g.screen = "inventory";
          }
        } else if (g.screen === "battle") {
          // Click enemy to target
          const alive = g.enemies.filter(e => e.hp > 0);
          alive.forEach((e, i) => {
            if (e._clickRect) {
              const r = e._clickRect;
              if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
                g.player.target = i;
              }
            }
          });
          // Flee button
          if (mx >= W-80 && mx <= W-16 && my >= H-50 && my <= H-22) {
            g.screen = "world"; addLog("Fled from battle!");
          }
          // Potion button
          if (mx >= W-160 && mx <= W-88 && my >= H-50 && my <= H-22) {
            const pi = g.inventory.findIndex(it => it.slot === 'potion');
            if (pi >= 0) {
              const pot = g.inventory[pi];
              g.player.hp = Math.min(g.player.maxHp, g.player.hp + pot.heal);
              g.inventory.splice(pi, 1);
              addLog(`${pot.emoji} Used ${pot.name}! HP: ${g.player.hp}`);
            }
          }
        } else if (g.screen === "victory" || g.screen === "defeat") {
          // Continue button
          if (mx >= W/2-110 && mx <= W/2-10 && my >= H/2+30 && my <= H/2+66) {
            g.screen = "world";
            if (g.screen !== "defeat") g.player.hp = g.player.maxHp;
          }
          // Cash Out button
          if (mx >= W/2+10 && mx <= W/2+110 && my >= H/2+30 && my <= H/2+66) {
            onFinish(g.totalCoins, g.areasCleared, g.totalKills);
            g.screen = "world"; g.player.hp = g.player.maxHp;
          }
          // Fix: always heal on continue from defeat
          g.player.hp = g.player.maxHp;
          g.screen = "world";
        } else if (g.screen === "inventory") {
          // Click item to equip
          g.inventory.forEach((item, i) => {
            if (item._rect) {
              const r = item._rect;
              if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
                if (item.slot === 'potion') {
                  g.player.hp = Math.min(g.player.maxHp, g.player.hp + item.heal);
                  g.inventory.splice(i, 1);
                  addLog(`${item.emoji} Used ${item.name}!`);
                } else {
                  const old = g.equipment[item.slot];
                  g.equipment[item.slot] = item;
                  g.inventory.splice(i, 1);
                  if (old) g.inventory.push(old);
                  addLog(`Equipped ${item.emoji} ${item.name}`);
                }
              }
            }
          });
          // Back button
          if (mx >= 20 && mx <= 100 && my >= H-50 && my <= H-18) {
            g.screen = "world";
          }
        }
      };

      // Right-click to discard items
      const onContext = (e) => {
        e.preventDefault();
        if (g.screen !== "inventory") return;
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (W / rect.width);
        const my = (e.clientY - rect.top) * (H / rect.height);
        g.inventory.forEach((item, i) => {
          if (item._rect) {
            const r = item._rect;
            if (mx >= r.x && mx <= r.x+r.w && my >= r.y && my <= r.y+r.h) {
              g.inventory.splice(i, 1);
              addLog(`Discarded ${item.emoji} ${item.name}`);
            }
          }
        });
      };

      canvas.addEventListener('click', onClick);
      canvas.addEventListener('contextmenu', onContext);

      // Game loop
      let lastTime = Date.now();
      const loop = () => {
        const now = Date.now();
        const dt = Math.min((now - lastTime) / 16.67, 3); // cap at 3x speed
        lastTime = now;
        updateBattle(dt);
        render(ctx);
        _raf = requestAnimationFrame(loop);
      };
      _raf = requestAnimationFrame(loop);

      this.cleanup = () => {
        if (_raf) cancelAnimationFrame(_raf);
        canvas.removeEventListener('click', onClick);
        canvas.removeEventListener('contextmenu', onContext);
      };
    },

    cleanup() {
      if (_raf) cancelAnimationFrame(_raf);
    }
  };
})();
