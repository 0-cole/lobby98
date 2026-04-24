// shooter.js — "Blitz" top-down multiplayer shooter
// WASD to move, mouse to aim, click to shoot. Server relays via Socket.IO.
(function() {
  const W = 800, H = 500, PLAYER_R = 14, BULLET_R = 4, BULLET_SPEED = 12;
  const PLAYER_SPEED = 4, FIRE_RATE = 200, MAX_HP = 100;
  const COLORS = ['#27b5d5','#e04858','#4caf50','#f5a623','#7c3aed','#f472b6','#15803d','#c89020','#38bdf8','#dc2626'];

  // Walls (x, y, w, h)
  const WALLS = [
    {x:200,y:100,w:20,h:180},{x:580,y:220,w:20,h:180},
    {x:300,y:350,w:200,h:20},{x:100,y:250,w:120,h:20},
    {x:580,y:80,w:120,h:20},{x:380,y:150,w:20,h:120},
  ];

  window.ShooterGame = {
    _raf: null, _socket: null, _keyHandler: null, _mouseHandler: null, _clickHandler: null,

    init(container, socket, roomCode, myId, myName) {
      this._socket = socket;
      let players = {};
      let bullets = [];
      let myAngle = 0, lastFire = 0, kills = 0, deaths = 0;
      const keys = {};
      let gameActive = true;
      let myHp = MAX_HP;
      const myColor = COLORS[Math.abs(hashStr(myId)) % COLORS.length];

      container.innerHTML = `
        <canvas id="shooter-canvas" width="${W}" height="${H}" style="display:block;margin:0 auto;border-radius:14px;cursor:crosshair;background:#1a2a3a;box-shadow:0 6px 20px rgba(0,0,0,0.3)"></canvas>
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:14px;font-weight:700">
          <span style="color:var(--success)" id="sh-kills">Kills: 0</span>
          <span style="color:var(--ink2)" id="sh-players">Players: 1</span>
          <span style="color:var(--danger)" id="sh-deaths">Deaths: 0</span>
        </div>
      `;
      const canvas = document.getElementById('shooter-canvas');
      const ctx = canvas.getContext('2d');

      // My initial position
      const spawnX = 100 + Math.random() * (W - 200);
      const spawnY = 100 + Math.random() * (H - 200);
      players[myId] = { x: spawnX, y: spawnY, angle: 0, hp: MAX_HP, name: myName, color: myColor };

      // Input
      this._keyHandler = (e) => {
        if (['w','a','s','d'].includes(e.key.toLowerCase())) {
          keys[e.key.toLowerCase()] = e.type === 'keydown';
          e.preventDefault();
        }
      };
      document.addEventListener('keydown', this._keyHandler);
      document.addEventListener('keyup', this._keyHandler);

      this._mouseHandler = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const p = players[myId];
        if (p) myAngle = Math.atan2(my - p.y, mx - p.x);
      };
      canvas.addEventListener('mousemove', this._mouseHandler);

      this._clickHandler = (e) => {
        if (!gameActive) return;
        const now = Date.now();
        if (now - lastFire < FIRE_RATE) return;
        lastFire = now;
        const p = players[myId];
        if (!p || p.hp <= 0) return;
        const bullet = {
          x: p.x + Math.cos(myAngle) * PLAYER_R,
          y: p.y + Math.sin(myAngle) * PLAYER_R,
          vx: Math.cos(myAngle) * BULLET_SPEED,
          vy: Math.sin(myAngle) * BULLET_SPEED,
          owner: myId, born: now
        };
        bullets.push(bullet);
        socket.emit('shooter:bullet', { x: bullet.x, y: bullet.y, vx: bullet.vx, vy: bullet.vy });
      };
      canvas.addEventListener('mousedown', this._clickHandler);

      // Socket handlers
      socket.on('shooter:state', (data) => {
        for (const [id, p] of Object.entries(data)) {
          if (id === myId) continue;
          players[id] = { ...players[id], ...p };
        }
        // Remove disconnected players
        for (const id of Object.keys(players)) {
          if (id !== myId && !data[id]) delete players[id];
        }
        document.getElementById('sh-players').textContent = `Players: ${Object.keys(players).length}`;
      });

      socket.on('shooter:bullet', (b) => {
        if (b.owner === myId) return;
        bullets.push({ ...b, born: Date.now() });
      });

      socket.on('shooter:kill', ({ killer, victim }) => {
        if (killer === myId) { kills++; document.getElementById('sh-kills').textContent = `Kills: ${kills}`; }
        if (victim === myId) {
          deaths++; document.getElementById('sh-deaths').textContent = `Deaths: ${deaths}`;
          // Respawn
          const p = players[myId];
          if (p) { p.x = 100 + Math.random() * (W-200); p.y = 100 + Math.random() * (H-200); p.hp = MAX_HP; myHp = MAX_HP; }
        }
      });

      function collideWall(x, y, r) {
        for (const w of WALLS) {
          const cx = Math.max(w.x, Math.min(x, w.x + w.w));
          const cy = Math.max(w.y, Math.min(y, w.y + w.h));
          if (Math.sqrt((x-cx)**2 + (y-cy)**2) < r) return true;
        }
        return false;
      }

      // Game loop
      const tick = () => {
        if (!gameActive) return;
        const p = players[myId];
        if (p && p.hp > 0) {
          let dx = 0, dy = 0;
          if (keys.w) dy -= PLAYER_SPEED;
          if (keys.s) dy += PLAYER_SPEED;
          if (keys.a) dx -= PLAYER_SPEED;
          if (keys.d) dx += PLAYER_SPEED;
          if (dx && dy) { dx *= 0.707; dy *= 0.707; }
          const nx = Math.max(PLAYER_R, Math.min(W - PLAYER_R, p.x + dx));
          const ny = Math.max(PLAYER_R, Math.min(H - PLAYER_R, p.y + dy));
          if (!collideWall(nx, p.y, PLAYER_R)) p.x = nx;
          if (!collideWall(p.x, ny, PLAYER_R)) p.y = ny;
          p.angle = myAngle;
          socket.emit('shooter:move', { x: p.x, y: p.y, angle: myAngle, hp: p.hp, name: myName, color: myColor });
        }

        // Update bullets
        const now = Date.now();
        bullets = bullets.filter(b => {
          b.x += b.vx; b.y += b.vy;
          if (b.x < 0 || b.x > W || b.y < 0 || b.y > H || now - b.born > 2000) return false;
          if (collideWall(b.x, b.y, BULLET_R)) return false;
          // Hit detection (only for my bullets hitting others, or others' bullets hitting me)
          if (b.owner === myId) {
            for (const [id, op] of Object.entries(players)) {
              if (id === myId || !op || op.hp <= 0) continue;
              if (Math.sqrt((b.x-op.x)**2 + (b.y-op.y)**2) < PLAYER_R + BULLET_R) {
                socket.emit('shooter:hit', { victim: id, damage: 20 });
                return false;
              }
            }
          } else if (b.owner !== myId && p) {
            if (Math.sqrt((b.x-p.x)**2 + (b.y-p.y)**2) < PLAYER_R + BULLET_R) {
              myHp -= 20; p.hp = Math.max(0, myHp);
              if (p.hp <= 0) socket.emit('shooter:died', { killer: b.owner });
              return false;
            }
          }
          return true;
        });

        // Render
        ctx.clearRect(0, 0, W, H);
        // Floor grid
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
        for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
        // Walls
        for (const w of WALLS) {
          ctx.fillStyle = '#2d4050';
          ctx.fillRect(w.x, w.y, w.w, w.h);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(w.x, w.y, w.w, 2);
        }
        // Players
        for (const [id, op] of Object.entries(players)) {
          if (!op || op.hp <= 0) continue;
          const isMe = id === myId;
          // Body
          ctx.beginPath(); ctx.arc(op.x, op.y, PLAYER_R, 0, Math.PI*2);
          ctx.fillStyle = op.color || (isMe ? myColor : '#888');
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();
          // Gun barrel
          const angle = op.angle || 0;
          ctx.beginPath();
          ctx.moveTo(op.x + Math.cos(angle)*PLAYER_R, op.y + Math.sin(angle)*PLAYER_R);
          ctx.lineTo(op.x + Math.cos(angle)*(PLAYER_R+10), op.y + Math.sin(angle)*(PLAYER_R+10));
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
          // HP bar
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(op.x-16, op.y-PLAYER_R-8, 32, 4);
          ctx.fillStyle = op.hp > 50 ? '#4caf50' : op.hp > 25 ? '#f5a623' : '#e04858';
          ctx.fillRect(op.x-16, op.y-PLAYER_R-8, 32*(op.hp/MAX_HP), 4);
          // Name
          ctx.fillStyle = '#fff'; ctx.font = '10px Nunito,sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(op.name || '???', op.x, op.y - PLAYER_R - 12);
        }
        // Bullets
        for (const b of bullets) {
          ctx.beginPath(); ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI*2);
          ctx.fillStyle = '#ffd700'; ctx.fill();
          ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 6;
          ctx.fill(); ctx.shadowBlur = 0;
        }

        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
      this.cleanup = () => {
        gameActive = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        document.removeEventListener('keydown', this._keyHandler);
        document.removeEventListener('keyup', this._keyHandler);
        canvas.removeEventListener('mousemove', this._mouseHandler);
        canvas.removeEventListener('mousedown', this._clickHandler);
        socket.off('shooter:state'); socket.off('shooter:bullet');
        socket.off('shooter:kill');
      };
    }
  };

  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return h; }
})();
