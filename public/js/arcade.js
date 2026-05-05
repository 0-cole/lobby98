// arcade.js v2 — anti-cheat wrappers, play-again, firing range, snake
// Each game calls onComplete(score) ONCE. Server caps at 50 coins.
// Anti-cheat: games track start time, the server validates timing.

(function() {
  // Anti-cheat: closure hides internals
  const _startTimes = {};
  const _completed = {};

  function safeComplete(gameId, score, onComplete) {
    if (_completed[gameId]) return; // prevent double-submit
    _completed[gameId] = true;
    const elapsed = Date.now() - (_startTimes[gameId] || Date.now());
    // Pass elapsed time so server can validate
    onComplete(Math.max(0, Math.min(50, Math.floor(score))), elapsed);
  }

  function makeEndButtons(container, gameId, onComplete) {
    // Remove any existing end buttons
    const existing = container.querySelector('.arcade-end-btns');
    if (existing) existing.remove();
    const wrap = document.createElement('div');
    wrap.className = 'arcade-end-btns';
    wrap.style.cssText = 'display:flex;gap:10px;justify-content:center;margin-top:18px;animation:endBtnsIn 0.4s cubic-bezier(0.22,1,0.36,1) both';
    wrap.innerHTML = `
      <button class="btn btn-ghost btn-sm arcade-end-back">← Back</button>
      <button class="btn btn-primary arcade-end-replay">Play Again</button>
    `;
    container.appendChild(wrap);
    wrap.querySelector('.arcade-end-back').addEventListener('click', () => {
      document.getElementById('arcade-back').click();
    });
    wrap.querySelector('.arcade-end-replay').addEventListener('click', () => {
      _completed[gameId] = false;
      _startTimes[gameId] = Date.now();
      const game = window.ArcadeGames[gameId];
      if (game) { game.cleanup?.(); container.innerHTML = ''; game.init(container, onComplete); }
    });
  }

  window.ArcadeGames = {

    // ==================== FIRING RANGE ====================
    clickspeed: {
      _raf: null,
      init(container, onComplete) {
        const gameId = 'clickspeed';
        _startTimes[gameId] = Date.now();
        _completed[gameId] = false;
        let totalScore = 0, round = 0, maxRounds = 15;

        container.innerHTML = `
          <h3 style="text-align:center;margin-bottom:8px;color:var(--deep);font-weight:800">🎯 Firing Range</h3>
          <p id="fr-status" style="text-align:center;margin-bottom:8px;color:var(--ink2);font-size:14px">Hit the targets! Center = 5pts, Ring = 3pts, Edge = 1pt · ${maxRounds} targets</p>
          <div id="fr-score" style="text-align:center;font-weight:800;font-size:20px;color:var(--deep);margin-bottom:8px">Score: 0</div>
          <div id="fr-field" style="position:relative;width:100%;height:360px;background:var(--neo);border-radius:16px;overflow:hidden;cursor:crosshair;box-shadow:inset 3px 3px 7px rgba(30,80,110,0.12),inset -3px -3px 7px rgba(255,255,255,0.9)"></div>
        `;
        const field = document.getElementById('fr-field');
        const scoreEl = document.getElementById('fr-score');
        const statusEl = document.getElementById('fr-status');

        const spawnTarget = () => {
          if (round >= maxRounds) {
            const coins = Math.min(50, totalScore);
            statusEl.innerHTML = `<strong>Range complete! ${totalScore} pts → ${coins} coins</strong>`;
            safeComplete(gameId, coins, onComplete);
            makeEndButtons(container, gameId, onComplete);
            return;
          }
          round++;
          statusEl.textContent = `Target ${round}/${maxRounds} · Score: ${totalScore}`;
          const size = 90;
          const x = Math.random() * (field.clientWidth - size - 20) + 10;
          const y = Math.random() * (field.clientHeight - size - 20) + 10;
          const target = document.createElement('div');
          target.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;cursor:crosshair;animation:targetIn 0.2s ease-out;`;
          // Concentric rings: outer=red, middle=white, inner=red, bullseye=gold
          target.innerHTML = `
            <svg width="${size}" height="${size}" viewBox="0 0 90 90">
              <circle cx="45" cy="45" r="44" fill="#e04858" opacity="0.9"/>
              <circle cx="45" cy="45" r="33" fill="#fff" opacity="0.9"/>
              <circle cx="45" cy="45" r="22" fill="#e04858" opacity="0.9"/>
              <circle cx="45" cy="45" r="11" fill="#ffd700"/>
              <circle cx="45" cy="45" r="4" fill="#000" opacity="0.3"/>
            </svg>
          `;
          let hit = false;
          target.addEventListener('click', (e) => {
            if (hit) return;
            hit = true;
            const rect = target.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);
            const radius = rect.width / 2;
            const ratio = dist / radius;
            let pts, label, color;
            if (ratio < 0.24) { pts = 5; label = 'BULLSEYE!'; color = '#ffd700'; }
            else if (ratio < 0.50) { pts = 3; label = 'Nice!'; color = '#4caf50'; }
            else { pts = 1; label = 'Edge'; color = '#e04858'; }
            totalScore += pts;
            scoreEl.textContent = `Score: ${totalScore}`;
            // Show hit feedback
            const fb = document.createElement('div');
            fb.style.cssText = `position:absolute;left:${x + size/2 - 20}px;top:${y - 10}px;font-weight:800;font-size:18px;color:${color};pointer-events:none;animation:hitFloat 0.6s ease-out forwards;text-shadow:0 1px 3px rgba(0,0,0,0.2)`;
            fb.textContent = `+${pts} ${label}`;
            field.appendChild(fb);
            setTimeout(() => fb.remove(), 700);
            target.remove();
            setTimeout(spawnTarget, 300);
          });
          // Auto-miss after 2.5 seconds
          const timeout = setTimeout(() => {
            if (!hit) {
              hit = true;
              const fb = document.createElement('div');
              fb.style.cssText = `position:absolute;left:${x + size/2 - 15}px;top:${y - 10}px;font-weight:800;font-size:16px;color:var(--ink3);pointer-events:none;animation:hitFloat 0.6s ease-out forwards`;
              fb.textContent = 'MISS';
              field.appendChild(fb);
              setTimeout(() => fb.remove(), 700);
              target.remove();
              setTimeout(spawnTarget, 300);
            }
          }, 2500);
          field.appendChild(target);
        };
        spawnTarget();
      },
      cleanup() {}
    },

    // ==================== MEMORY MATCH ====================
    memory: {
      init(container, onComplete) {
        const gameId = 'memory';
        _startTimes[gameId] = Date.now();
        _completed[gameId] = false;
        const emojis = ["🐶","🐱","🐸","🦊","🐼","🐨","🦄","🐙"];
        const deck = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
        let flipped = [], matched = 0, moves = 0, locked = false;

        container.innerHTML = `
          <h3 style="text-align:center;margin-bottom:8px;color:var(--deep);font-weight:800">🧠 Memory Match</h3>
          <p id="mem-status" style="text-align:center;margin-bottom:8px;color:var(--ink2);font-size:14px">Moves: 0 | Pairs: 0/8</p>
          <div id="mem-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:340px;margin:0 auto"></div>
        `;
        const grid = document.getElementById('mem-grid');
        const status = document.getElementById('mem-status');

        deck.forEach((emoji, i) => {
          const card = document.createElement('button');
          card.textContent = '?';
          card.style.cssText = 'width:100%;aspect-ratio:1;font-size:26px;border:none;border-radius:12px;cursor:pointer;background:var(--neo);box-shadow:3px 3px 8px rgba(30,80,110,0.12),-2px -2px 6px rgba(255,255,255,0.9);transition:all 0.15s;font-family:inherit';
          card.addEventListener('click', () => {
            if (locked || card.dataset.done || flipped.includes(card)) return;
            card.textContent = emoji;
            card.style.background = 'rgba(255,255,255,0.8)';
            flipped.push(card);
            if (flipped.length === 2) {
              moves++; locked = true;
              const [a, b] = flipped;
              if (a.textContent === b.textContent) {
                matched++; a.dataset.done = '1'; b.dataset.done = '1';
                a.style.background = 'rgba(76,175,80,0.15)'; b.style.background = 'rgba(76,175,80,0.15)';
                flipped = []; locked = false;
                status.textContent = `Moves: ${moves} | Pairs: ${matched}/8`;
                if (matched === 8) {
                  const coins = Math.max(5, Math.min(50, 50 - moves * 2));
                  status.innerHTML = `<strong>Done in ${moves} moves! Earned ${coins} coins</strong>`;
                  safeComplete(gameId, coins, onComplete);
                  makeEndButtons(container, gameId, onComplete);
                }
              } else {
                setTimeout(() => { a.textContent = '?'; b.textContent = '?'; a.style.background = 'var(--neo)'; b.style.background = 'var(--neo)'; flipped = []; locked = false; }, 600);
              }
            }
          });
          grid.appendChild(card);
        });
      },
      cleanup() {}
    },

    // ==================== MINESWEEPER ====================
    minesweeper: {
      init(container, onComplete) {
        const gameId = 'minesweeper';
        _startTimes[gameId] = Date.now();
        _completed[gameId] = false;
        const W = 8, H = 8, MINES = 10;
        let board = [], revealed = [], flagged = [], gameOver = false, firstClick = true;
        const init = () => { board = Array(H).fill(null).map(() => Array(W).fill(0)); revealed = Array(H).fill(null).map(() => Array(W).fill(false)); flagged = Array(H).fill(null).map(() => Array(W).fill(false)); };
        init();

        function placeMines(sr, sc) {
          let placed = 0;
          while (placed < MINES) {
            const r = Math.floor(Math.random()*H), c = Math.floor(Math.random()*W);
            if (board[r][c]===-1||(Math.abs(r-sr)<=1&&Math.abs(c-sc)<=1)) continue;
            board[r][c] = -1; placed++;
          }
          for (let r=0;r<H;r++) for (let c=0;c<W;c++) {
            if (board[r][c]===-1) continue; let n=0;
            for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) { const nr=r+dr,nc=c+dc; if(nr>=0&&nr<H&&nc>=0&&nc<W&&board[nr][nc]===-1) n++; }
            board[r][c] = n;
          }
        }
        function reveal(r,c) { if(r<0||r>=H||c<0||c>=W||revealed[r][c]||flagged[r][c]) return; revealed[r][c]=true; if(board[r][c]===0) for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) reveal(r+dr,c+dc); }
        function checkWin() { let s=0; for(let r=0;r<H;r++) for(let c=0;c<W;c++) if(revealed[r][c]) s++; return s===W*H-MINES; }

        container.innerHTML = `
          <h3 style="text-align:center;margin-bottom:8px;color:var(--deep);font-weight:800">💣 Minesweeper</h3>
          <p id="ms-status" style="text-align:center;margin-bottom:8px;color:var(--ink2);font-size:14px">Click to reveal. Right-click to flag. 10 mines.</p>
          <div id="ms-grid" style="display:grid;grid-template-columns:repeat(${W},1fr);gap:3px;max-width:340px;margin:0 auto"></div>
        `;
        const grid = document.getElementById('ms-grid');
        const status = document.getElementById('ms-status');

        function render() {
          grid.innerHTML = '';
          for (let r=0;r<H;r++) for (let c=0;c<W;c++) {
            const btn = document.createElement('button');
            btn.style.cssText = 'width:100%;aspect-ratio:1;font-size:15px;border:none;border-radius:5px;cursor:pointer;font-family:"Nunito",sans-serif;font-weight:700;transition:all 0.1s;';
            if (revealed[r][c]) {
              const v = board[r][c];
              btn.style.background = v===-1?'#ff6b7d':'rgba(255,255,255,0.6)';
              btn.style.cursor = 'default';
              btn.textContent = v===-1?'💣':v===0?'':v;
              btn.style.color = ['','#1889ab','#2d9e5a','#dc2626','#7c3aed','#c89020','#1ab5d5','#0a3d5c','#333'][v]||'#333';
            } else if (flagged[r][c]) {
              btn.style.background = 'var(--neo)'; btn.textContent = '🚩';
              btn.style.boxShadow = 'inset 2px 2px 4px rgba(30,80,110,0.1),inset -2px -2px 4px rgba(255,255,255,0.9)';
            } else {
              btn.style.background = 'var(--neo)'; btn.style.boxShadow = '2px 2px 5px rgba(30,80,110,0.1),-2px -2px 4px rgba(255,255,255,0.9)';
            }
            if (!gameOver) {
              btn.addEventListener('click', () => {
                if (gameOver||revealed[r][c]||flagged[r][c]) return;
                if (firstClick) { placeMines(r,c); firstClick=false; }
                if (board[r][c]===-1) {
                  gameOver=true; for(let rr=0;rr<H;rr++) for(let cc=0;cc<W;cc++) revealed[rr][cc]=true;
                  render(); status.innerHTML = `<strong style="color:var(--danger)">💥 Boom! 0 coins</strong>`;
                  safeComplete(gameId, 0, onComplete); makeEndButtons(container, gameId, onComplete); return;
                }
                reveal(r,c); render();
                if (checkWin()) {
                  gameOver=true; const secs=((Date.now()-_startTimes[gameId])/1000).toFixed(1);
                  const coins = Math.max(10, Math.min(50, Math.round(50 - (Date.now()-_startTimes[gameId])/2000)));
                  status.innerHTML = `<strong style="color:var(--success)">Cleared in ${secs}s! ${coins} coins</strong>`;
                  safeComplete(gameId, coins, onComplete); makeEndButtons(container, gameId, onComplete);
                }
              });
              btn.addEventListener('contextmenu', e => { e.preventDefault(); if(gameOver||revealed[r][c]) return; flagged[r][c]=!flagged[r][c]; render(); });
            }
            grid.appendChild(btn);
          }
        }
        render();
      },
      cleanup() {}
    },

    // ==================== MATH RUSH ====================
    mathrush: {
      _interval: null,
      init(container, onComplete) {
        const gameId = 'mathrush';
        _completed[gameId] = false;

        // Show start screen first
        container.innerHTML = `
          <h3 style="text-align:center;margin-bottom:8px;color:var(--deep);font-weight:800">🔢 Math Rush</h3>
          <div style="text-align:center;padding:40px 20px">
            <p style="font-size:16px;color:var(--ink2);margin-bottom:16px">Solve as many math problems as you can in 30 seconds!</p>
            <p style="font-size:14px;color:var(--ink3);margin-bottom:24px">Addition, subtraction, and multiplication. 5 coins per correct answer (max 50).</p>
            <button id="mr-start-btn" class="btn btn-primary btn-lg" style="font-size:20px;padding:16px 40px">Start!</button>
          </div>
        `;

        document.getElementById('mr-start-btn').addEventListener('click', () => {
          this._startGame(container, onComplete, gameId);
        });
      },
      _startGame(container, onComplete, gameId) {
        _startTimes[gameId] = Date.now();
        let score = 0, timeLeft = 30, answer = 0;
        container.innerHTML = `
          <h3 style="text-align:center;margin-bottom:8px;color:var(--deep);font-weight:800">🔢 Math Rush</h3>
          <p id="mr-status" style="text-align:center;margin-bottom:6px;color:var(--ink2);font-size:14px">Go go go!</p>
          <div style="text-align:center;margin-bottom:8px"><span id="mr-timer" style="font-size:26px;font-weight:800;color:var(--deep)">30</span><span style="color:var(--ink3)">s</span> · <span id="mr-score" style="font-size:18px;font-weight:700;color:var(--success)">0 correct</span></div>
          <div id="mr-problem" style="text-align:center;font-size:34px;font-weight:800;color:var(--deep);margin:14px 0"></div>
          <div style="display:flex;gap:8px;max-width:280px;margin:0 auto"><input class="inp" type="number" id="mr-input" style="flex:1;font-size:22px;text-align:center;font-weight:700" /><button class="btn btn-primary" id="mr-submit">→</button></div>
        `;
        const timerEl = document.getElementById('mr-timer');
        const scoreEl = document.getElementById('mr-score');
        const problemEl = document.getElementById('mr-problem');
        const inputEl = document.getElementById('mr-input');
        const submitBtn = document.getElementById('mr-submit');
        const statusEl = document.getElementById('mr-status');

        function newProblem() {
          const ops = ['+','-','×'];
          const op = ops[Math.floor(Math.random()*ops.length)];
          let a, b;
          if (op==='×') { a=Math.floor(Math.random()*12)+1; b=Math.floor(Math.random()*12)+1; answer=a*b; }
          else if (op==='+') { a=Math.floor(Math.random()*50)+10; b=Math.floor(Math.random()*50)+10; answer=a+b; }
          else { a=Math.floor(Math.random()*50)+20; b=Math.floor(Math.random()*a); answer=a-b; }
          problemEl.textContent = `${a} ${op} ${b} = ?`;
          inputEl.value = ''; inputEl.focus();
        }
        function submit() {
          if (timeLeft<=0) return;
          if (parseInt(inputEl.value)===answer) { score++; scoreEl.textContent = `${score} correct`; }
          newProblem();
        }
        submitBtn.addEventListener('click', submit);
        inputEl.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();submit();} });
        newProblem();
        inputEl.focus();

        this._interval = setInterval(() => {
          timeLeft--;
          timerEl.textContent = timeLeft;
          if (timeLeft<=5) timerEl.style.color = 'var(--danger)';
          if (timeLeft<=0) {
            clearInterval(this._interval);
            const coins = Math.min(50, score * 5);
            statusEl.innerHTML = `<strong>${score} correct → ${coins} coins</strong>`;
            inputEl.disabled = true; submitBtn.disabled = true;
            safeComplete(gameId, coins, onComplete);
            makeEndButtons(container, gameId, onComplete);
          }
        }, 1000);
      },
      cleanup() { if (this._interval) clearInterval(this._interval); }
    },

    // ==================== SNAKE ====================
    snake: {
      _interval: null,
      init(container, onComplete) {
        const gameId = 'snake';
        _startTimes[gameId] = Date.now();
        _completed[gameId] = false;
        const COLS = 20, ROWS = 14, CELL = 22;
        let snake = [{x:10,y:7}], dir = {x:1,y:0}, food = null, score = 0, gameOver = false, started = false;

        container.innerHTML = `
          <h3 style="text-align:center;margin-bottom:8px;color:var(--deep);font-weight:800">🐍 Snake</h3>
          <p id="sn-status" style="text-align:center;margin-bottom:8px;color:var(--ink2);font-size:14px">Use arrow keys or WASD. Eat food, grow, don't hit walls or yourself!</p>
          <div id="sn-score" style="text-align:center;font-weight:800;font-size:18px;color:var(--deep);margin-bottom:6px">Score: 0</div>
          <canvas id="sn-canvas" width="${COLS*CELL}" height="${ROWS*CELL}" style="display:block;margin:0 auto;border-radius:12px;background:var(--neo);box-shadow:inset 3px 3px 7px rgba(30,80,110,0.12),inset -3px -3px 7px rgba(255,255,255,0.9)"></canvas>
          <p style="text-align:center;margin-top:8px;font-size:13px;color:var(--ink3)">Press any arrow key to start</p>
        `;
        const canvas = document.getElementById('sn-canvas');
        const ctx = canvas.getContext('2d');
        const scoreEl = document.getElementById('sn-score');
        const statusEl = document.getElementById('sn-status');

        function spawnFood() {
          let pos;
          do { pos = {x:Math.floor(Math.random()*COLS), y:Math.floor(Math.random()*ROWS)}; }
          while (snake.some(s => s.x===pos.x && s.y===pos.y));
          food = pos;
        }
        spawnFood();

        function draw() {
          ctx.clearRect(0,0,canvas.width,canvas.height);
          // Grid lines (subtle)
          ctx.strokeStyle = 'rgba(30,80,110,0.04)';
          for (let x=0;x<=COLS;x++) { ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,ROWS*CELL); ctx.stroke(); }
          for (let y=0;y<=ROWS;y++) { ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(COLS*CELL,y*CELL); ctx.stroke(); }
          // Food
          if (food) {
            ctx.fillStyle = '#e04858';
            ctx.beginPath(); ctx.arc(food.x*CELL+CELL/2, food.y*CELL+CELL/2, CELL/2-3, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(food.x*CELL+CELL/2, food.y*CELL+CELL/2, CELL/4-1, 0, Math.PI*2); ctx.fill();
          }
          // Snake
          snake.forEach((seg, i) => {
            const isHead = i === 0;
            const grad = ctx.createRadialGradient(seg.x*CELL+CELL/2, seg.y*CELL+CELL/2, 0, seg.x*CELL+CELL/2, seg.y*CELL+CELL/2, CELL/2);
            if (isHead) { grad.addColorStop(0, '#6cd0e8'); grad.addColorStop(1, '#1889ab'); }
            else { grad.addColorStop(0, '#a8e6cf'); grad.addColorStop(1, '#5bb8d4'); }
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.roundRect(seg.x*CELL+1, seg.y*CELL+1, CELL-2, CELL-2, 5); ctx.fill();
            if (isHead) {
              ctx.fillStyle = '#fff';
              ctx.beginPath(); ctx.arc(seg.x*CELL+CELL/2, seg.y*CELL+CELL/2, 3, 0, Math.PI*2); ctx.fill();
            }
          });
        }

        function step() {
          if (gameOver) return;
          const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
          // Wall collision
          if (head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS) { endGame(); return; }
          // Self collision
          if (snake.some(s => s.x===head.x && s.y===head.y)) { endGame(); return; }
          snake.unshift(head);
          if (food && head.x===food.x && head.y===food.y) {
            score += 2;
            scoreEl.textContent = `Score: ${score}`;
            spawnFood();
          } else {
            snake.pop();
          }
          draw();
        }

        function endGame() {
          gameOver = true;
          if (this._interval) clearInterval(this._interval);
          const coins = Math.min(50, score);
          statusEl.innerHTML = `<strong>Game over! Score: ${score} → ${coins} coins</strong>`;
          safeComplete(gameId, coins, onComplete);
          makeEndButtons(container, gameId, onComplete);
        }

        const keyHandler = (e) => {
          if (gameOver) return;
          const key = e.key.toLowerCase();
          if (['arrowup','w'].includes(key) && dir.y!==1) { dir={x:0,y:-1}; e.preventDefault(); }
          else if (['arrowdown','s'].includes(key) && dir.y!==-1) { dir={x:0,y:1}; e.preventDefault(); }
          else if (['arrowleft','a'].includes(key) && dir.x!==1) { dir={x:-1,y:0}; e.preventDefault(); }
          else if (['arrowright','d'].includes(key) && dir.x!==-1) { dir={x:1,y:0}; e.preventDefault(); }
          if (!started) { started = true; this._interval = setInterval(() => step.call(this), 130); }
        };
        this._keyHandler = keyHandler.bind(this);
        document.addEventListener('keydown', this._keyHandler);
        draw();
      },
      cleanup() {
        if (this._interval) clearInterval(this._interval);
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
      }
    },

    // ==================== SLOTS ====================
    // Server-authoritative slot machine. Pick wager, hit Spin, server rolls 3 reels.
    // Wager is deducted upfront; payouts come back based on matches.
    slots: {
      init(container, onComplete) {
        const gameId = 'slots';
        _startTimes[gameId] = Date.now();
        _completed[gameId] = false;
        let myCoins = (window.user?.coins) || 0;
        let wager = 5;
        const SYMBOLS = ['🍒','🍋','🔔','🍀','7️⃣','💎'];

        container.innerHTML = `
          <div style="text-align:center;max-width:480px;margin:0 auto">
            <h3 style="color:var(--deep);font-weight:800;margin-bottom:6px">🎰 Lucky Slots</h3>
            <p style="color:var(--ink2);font-size:13px;margin-bottom:14px">Match 3 to win big. Match 2 for a small payout.</p>
            <div id="sl-balance" style="font-weight:800;font-size:18px;color:#ffd700;margin-bottom:10px">💰 ${myCoins}</div>

            <div id="sl-reels" style="display:flex;gap:10px;justify-content:center;background:linear-gradient(180deg,#1a0d05,#3a1a08);padding:18px 14px;border-radius:18px;box-shadow:0 6px 20px rgba(0,0,0,0.4),inset 0 2px 8px rgba(0,0,0,0.5);margin-bottom:14px;border:3px solid #c8a040">
              <div class="sl-reel" id="sl-r0" style="width:88px;height:110px;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:60px;box-shadow:inset 0 4px 8px rgba(0,0,0,0.2);overflow:hidden">🎰</div>
              <div class="sl-reel" id="sl-r1" style="width:88px;height:110px;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:60px;box-shadow:inset 0 4px 8px rgba(0,0,0,0.2);overflow:hidden">🎰</div>
              <div class="sl-reel" id="sl-r2" style="width:88px;height:110px;background:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:60px;box-shadow:inset 0 4px 8px rgba(0,0,0,0.2);overflow:hidden">🎰</div>
            </div>

            <div id="sl-result" style="min-height:24px;font-weight:800;font-size:16px;margin-bottom:10px"></div>

            <div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:12px">
              <span style="color:var(--ink2);font-weight:700">Bet:</span>
              <button id="sl-dec" class="btn btn-ghost btn-sm" style="min-width:32px">−</button>
              <span id="sl-wager" style="font-weight:900;font-size:18px;color:var(--deep);min-width:50px;text-align:center">${wager}</span>
              <button id="sl-inc" class="btn btn-ghost btn-sm" style="min-width:32px">+</button>
              <button id="sl-max" class="btn btn-ghost btn-sm" style="font-size:11px">Max</button>
            </div>

            <button id="sl-spin" class="btn btn-primary btn-lg" style="min-width:160px">🎲 SPIN</button>

            <div style="margin-top:18px;padding:12px;background:var(--neo);border-radius:12px;font-size:12px;color:var(--ink2);text-align:left">
              <div style="font-weight:800;margin-bottom:6px;color:var(--ink)">Payout (×wager)</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">
                <span>🍒🍒🍒 ×3</span><span>🍒🍒 ×1</span>
                <span>🍋🍋🍋 ×5</span><span>🍋🍋 ×1.5</span>
                <span>🔔🔔🔔 ×8</span><span>🔔🔔 ×2</span>
                <span>🍀🍀🍀 ×12</span><span>🍀🍀 ×3</span>
                <span>7️⃣7️⃣7️⃣ ×25</span><span>7️⃣7️⃣ ×5</span>
                <span style="color:#ffd700;font-weight:800">💎💎💎 ×100</span><span>💎💎 ×10</span>
              </div>
            </div>
          </div>
        `;

        const wagerEl = document.getElementById('sl-wager');
        const balanceEl = document.getElementById('sl-balance');
        const resultEl = document.getElementById('sl-result');
        const spinBtn = document.getElementById('sl-spin');
        const reels = [0,1,2].map(i => document.getElementById(`sl-r${i}`));

        const updateWager = () => {
          wager = Math.max(1, Math.min(100, Math.min(myCoins, wager)));
          wagerEl.textContent = wager;
          spinBtn.disabled = myCoins < wager;
        };
        document.getElementById('sl-dec').addEventListener('click', () => { wager = Math.max(1, wager - 5); updateWager(); });
        document.getElementById('sl-inc').addEventListener('click', () => { wager = Math.min(100, wager + 5); updateWager(); });
        document.getElementById('sl-max').addEventListener('click', () => { wager = Math.min(100, myCoins); updateWager(); });

        let spinning = false;
        spinBtn.addEventListener('click', async () => {
          if (spinning) return;
          if (myCoins < wager) { resultEl.textContent = "Not enough coins!"; resultEl.style.color = "var(--danger)"; return; }
          spinning = true;
          spinBtn.disabled = true;
          resultEl.textContent = "Spinning...";
          resultEl.style.color = "var(--ink2)";
          // Animate reels with random symbols
          const intervals = reels.map((reel, i) => setInterval(() => {
            reel.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
          }, 60));

          try {
            const res = await fetch('/api/arcade/score', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ game: 'slots', score: wager, elapsed: 9999 })
            });
            const data = await res.json();
            // Stop reels one at a time with a stagger
            for (let i = 0; i < 3; i++) {
              await new Promise(r => setTimeout(r, 600 + i * 350));
              clearInterval(intervals[i]);
              if (data.reels) {
                reels[i].textContent = data.reels[i];
                reels[i].style.transition = 'transform 0.15s';
                reels[i].style.transform = 'scale(1.1)';
                setTimeout(() => { reels[i].style.transform = 'scale(1)'; }, 150);
              }
            }
            await new Promise(r => setTimeout(r, 250));
            if (data.error) {
              resultEl.textContent = data.error; resultEl.style.color = "var(--danger)";
            } else {
              myCoins = data.user?.coins ?? myCoins;
              if (window.user) window.user.coins = myCoins;
              balanceEl.textContent = `💰 ${myCoins}`;
              if (data.outcome === 'jackpot') {
                resultEl.innerHTML = `💎 <span style="color:#ffd700">JACKPOT!</span> +${data.payout - data.wager} coins!`;
                resultEl.style.color = "#ffd700";
                if (window.spawnParticles) for (let p = 0; p < 50; p++) setTimeout(() => window.spawnParticles?.(window.innerWidth/2, window.innerHeight/3, 'confetti'), p*30);
              } else if (data.outcome === 'triple') {
                resultEl.textContent = `🎉 Triple! +${data.payout - data.wager} coins`;
                resultEl.style.color = "var(--success)";
              } else if (data.outcome === 'pair') {
                resultEl.textContent = data.net > 0 ? `Pair! +${data.net} coins` : data.net === 0 ? `Pair! Break even` : `Pair! ${data.net} coins`;
                resultEl.style.color = data.net >= 0 ? "var(--success)" : "var(--ink2)";
              } else {
                resultEl.textContent = `No match. -${data.wager} coins`;
                resultEl.style.color = "var(--ink3)";
              }
              // Update top-bar coins display if present
              if (window.refreshUser) window.refreshUser();
            }
          } catch (err) {
            for (const it of intervals) clearInterval(it);
            resultEl.textContent = "Spin failed";
            resultEl.style.color = "var(--danger)";
          }
          spinning = false;
          updateWager();
        });

        updateWager();
      },
      cleanup() {}
    }
  };
})();
