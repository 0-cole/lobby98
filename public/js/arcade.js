// arcade.js — self-contained arcade game implementations
// Each game: { init(container, onComplete), cleanup() }
// onComplete(score) is called with coins earned (0-50)

window.ArcadeGames = {

  // ==================== MEMORY MATCH ====================
  memory: {
    _interval: null,
    init(container, onComplete) {
      const emojis = ["🐶","🐱","🐸","🦊","🐼","🐨","🦄","🐙"];
      const deck = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
      let flipped = [], matched = 0, moves = 0, locked = false;
      const start = Date.now();

      container.innerHTML = `
        <h3 style="text-align:center;margin-bottom:12px;color:var(--deep);font-weight:800">Memory Match</h3>
        <p id="mem-status" style="text-align:center;margin-bottom:10px;color:var(--ink-dim)">Moves: 0 | Pairs: 0/8</p>
        <div id="mem-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:360px;margin:0 auto"></div>
      `;
      const grid = document.getElementById("mem-grid");
      const status = document.getElementById("mem-status");

      deck.forEach((emoji, i) => {
        const card = document.createElement("button");
        card.className = "mem-card";
        card.dataset.idx = i;
        card.textContent = "?";
        card.style.cssText = "width:100%;aspect-ratio:1;font-size:28px;border:none;border-radius:12px;cursor:pointer;background:var(--neo);box-shadow:3px 3px 8px rgba(30,80,110,0.12),-2px -2px 6px rgba(255,255,255,0.9);transition:all 0.15s;font-family:inherit";
        card.addEventListener("click", () => {
          if (locked || card.dataset.done || flipped.includes(card)) return;
          card.textContent = emoji;
          card.style.background = "rgba(255,255,255,0.8)";
          flipped.push(card);
          if (flipped.length === 2) {
            moves++;
            locked = true;
            const [a, b] = flipped;
            if (a.textContent === b.textContent) {
              matched++;
              a.dataset.done = "1"; b.dataset.done = "1";
              a.style.background = "rgba(93,194,100,0.2)"; b.style.background = "rgba(93,194,100,0.2)";
              flipped = []; locked = false;
              status.textContent = `Moves: ${moves} | Pairs: ${matched}/8`;
              if (matched === 8) {
                const secs = ((Date.now() - start) / 1000).toFixed(1);
                const coins = Math.max(5, Math.min(50, 50 - moves * 2));
                status.innerHTML = `<strong>Done in ${moves} moves (${secs}s)! Earned ${coins} coins</strong>`;
                onComplete(coins);
              }
            } else {
              setTimeout(() => {
                a.textContent = "?"; b.textContent = "?";
                a.style.background = "var(--neo)"; b.style.background = "var(--neo)";
                flipped = []; locked = false;
              }, 600);
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
      const W = 8, H = 8, MINES = 10;
      let board = [], revealed = [], flagged = [], gameOver = false, firstClick = true;
      const init = () => { board = Array(H).fill(null).map(() => Array(W).fill(0)); revealed = Array(H).fill(null).map(() => Array(W).fill(false)); flagged = Array(H).fill(null).map(() => Array(W).fill(false)); };
      init();

      function placeMines(safeR, safeC) {
        let placed = 0;
        while (placed < MINES) {
          const r = Math.floor(Math.random() * H), c = Math.floor(Math.random() * W);
          if (board[r][c] === -1 || (Math.abs(r-safeR) <= 1 && Math.abs(c-safeC) <= 1)) continue;
          board[r][c] = -1; placed++;
        }
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
          if (board[r][c] === -1) continue;
          let n = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const nr = r+dr, nc = c+dc;
            if (nr >= 0 && nr < H && nc >= 0 && nc < W && board[nr][nc] === -1) n++;
          }
          board[r][c] = n;
        }
      }

      function reveal(r, c) {
        if (r < 0 || r >= H || c < 0 || c >= W || revealed[r][c] || flagged[r][c]) return;
        revealed[r][c] = true;
        if (board[r][c] === 0) { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) reveal(r+dr, c+dc); }
      }

      function checkWin() {
        let safe = 0;
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (revealed[r][c]) safe++;
        return safe === W * H - MINES;
      }

      container.innerHTML = `
        <h3 style="text-align:center;margin-bottom:12px;color:var(--deep);font-weight:800">Minesweeper</h3>
        <p id="ms-status" style="text-align:center;margin-bottom:10px;color:var(--ink-dim)">Click to reveal. Right-click to flag. 10 mines.</p>
        <div id="ms-grid" style="display:grid;grid-template-columns:repeat(${W},1fr);gap:3px;max-width:360px;margin:0 auto"></div>
      `;
      const grid = document.getElementById("ms-grid");
      const status = document.getElementById("ms-status");
      const start = Date.now();

      function render() {
        grid.innerHTML = "";
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
          const btn = document.createElement("button");
          btn.style.cssText = "width:100%;aspect-ratio:1;font-size:16px;border:none;border-radius:6px;cursor:pointer;font-family:'Nunito',sans-serif;font-weight:700;transition:all 0.1s;";
          if (revealed[r][c]) {
            const v = board[r][c];
            btn.style.background = v === -1 ? "#ff6b7d" : "rgba(255,255,255,0.6)";
            btn.style.cursor = "default";
            btn.textContent = v === -1 ? "💣" : v === 0 ? "" : v;
            btn.style.color = ["","#1a8caf","#2d9e5a","#dc2626","#7c3aed","#c89020","#1ab5d5","#0b4d6e","#333"][v] || "#333";
          } else if (flagged[r][c]) {
            btn.style.background = "var(--neo)"; btn.textContent = "🚩";
            btn.style.boxShadow = "inset 2px 2px 4px rgba(30,80,110,0.1), inset -2px -2px 4px rgba(255,255,255,0.9)";
          } else {
            btn.style.background = "var(--neo)";
            btn.style.boxShadow = "2px 2px 6px rgba(30,80,110,0.1),-2px -2px 4px rgba(255,255,255,0.9)";
          }
          if (!gameOver) {
            btn.addEventListener("click", () => {
              if (gameOver || revealed[r][c] || flagged[r][c]) return;
              if (firstClick) { placeMines(r, c); firstClick = false; }
              if (board[r][c] === -1) {
                gameOver = true;
                for (let rr = 0; rr < H; rr++) for (let cc = 0; cc < W; cc++) revealed[rr][cc] = true;
                render(); status.innerHTML = "<strong style='color:var(--danger)'>💥 Boom! 0 coins</strong>"; onComplete(0); return;
              }
              reveal(r, c); render();
              if (checkWin()) {
                gameOver = true;
                const secs = ((Date.now() - start) / 1000).toFixed(1);
                const coins = Math.max(10, Math.min(50, Math.round(50 - (Date.now() - start) / 2000)));
                status.innerHTML = `<strong style='color:var(--success)'>Cleared in ${secs}s! Earned ${coins} coins</strong>`;
                onComplete(coins);
              }
            });
            btn.addEventListener("contextmenu", (e) => {
              e.preventDefault(); if (gameOver || revealed[r][c]) return;
              flagged[r][c] = !flagged[r][c]; render();
            });
          }
          grid.appendChild(btn);
        }
      }
      render();
    },
    cleanup() {}
  },

  // ==================== CLICK SPEED ====================
  clickspeed: {
    _timeout: null,
    init(container, onComplete) {
      let targets = 20, clicked = 0, start = null;
      container.innerHTML = `
        <h3 style="text-align:center;margin-bottom:12px;color:var(--deep);font-weight:800">Click Speed</h3>
        <p id="cs-status" style="text-align:center;margin-bottom:10px;color:var(--ink-dim)">Click the circles as fast as you can! ${targets} targets.</p>
        <div id="cs-field" style="position:relative;width:100%;height:350px;background:var(--neo);border-radius:16px;overflow:hidden;box-shadow:inset 3px 3px 7px rgba(30,80,110,0.12),inset -3px -3px 7px rgba(255,255,255,0.9)"></div>
      `;
      const field = document.getElementById("cs-field");
      const status = document.getElementById("cs-status");

      const spawnTarget = () => {
        if (clicked >= targets) return;
        const size = 44;
        const x = Math.random() * (field.clientWidth - size);
        const y = Math.random() * (field.clientHeight - size);
        const t = document.createElement("div");
        t.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;cursor:pointer;
          background:radial-gradient(circle at 35% 30%,#fff,#5ce0f5 50%,#1a8caf);
          box-shadow:0 4px 12px rgba(26,140,175,0.4);transition:transform 0.1s;`;
        t.addEventListener("click", () => {
          if (!start) start = Date.now();
          clicked++;
          t.remove();
          status.textContent = `${clicked}/${targets}`;
          if (clicked >= targets) {
            const secs = ((Date.now() - start) / 1000).toFixed(2);
            const coins = Math.max(5, Math.min(50, Math.round(50 - secs * 2)));
            status.innerHTML = `<strong>${secs}s! Earned ${coins} coins</strong>`;
            onComplete(coins);
          } else {
            spawnTarget();
          }
        });
        field.appendChild(t);
      };
      spawnTarget();
    },
    cleanup() { if (this._timeout) clearTimeout(this._timeout); }
  },

  // ==================== MATH RUSH ====================
  mathrush: {
    _interval: null,
    init(container, onComplete) {
      let score = 0, timeLeft = 30, answer = 0;
      container.innerHTML = `
        <h3 style="text-align:center;margin-bottom:12px;color:var(--deep);font-weight:800">Math Rush</h3>
        <p id="mr-status" style="text-align:center;margin-bottom:10px;color:var(--ink-dim)">Solve as many as you can in 30 seconds!</p>
        <div style="text-align:center;margin-bottom:10px"><span id="mr-timer" style="font-size:28px;font-weight:800;color:var(--deep)">30</span><span style="color:var(--ink-dim)">s</span> · <span id="mr-score" style="font-size:20px;font-weight:700;color:var(--success)">0 correct</span></div>
        <div id="mr-problem" style="text-align:center;font-size:36px;font-weight:800;color:var(--deep);margin:16px 0"></div>
        <div style="display:flex;gap:8px;max-width:300px;margin:0 auto">
          <input class="inp" type="number" id="mr-input" style="flex:1;font-size:24px;text-align:center;font-weight:700" autofocus />
          <button class="btn btn-primary" id="mr-submit">→</button>
        </div>
      `;
      const timerEl = document.getElementById("mr-timer");
      const scoreEl = document.getElementById("mr-score");
      const problemEl = document.getElementById("mr-problem");
      const inputEl = document.getElementById("mr-input");
      const submitBtn = document.getElementById("mr-submit");
      const statusEl = document.getElementById("mr-status");

      function newProblem() {
        const ops = ["+", "-", "×"];
        const op = ops[Math.floor(Math.random() * ops.length)];
        let a, b;
        if (op === "×") { a = Math.floor(Math.random() * 12) + 1; b = Math.floor(Math.random() * 12) + 1; answer = a * b; }
        else if (op === "+") { a = Math.floor(Math.random() * 50) + 10; b = Math.floor(Math.random() * 50) + 10; answer = a + b; }
        else { a = Math.floor(Math.random() * 50) + 20; b = Math.floor(Math.random() * a); answer = a - b; }
        problemEl.textContent = `${a} ${op} ${b} = ?`;
        inputEl.value = ""; inputEl.focus();
      }

      function submit() {
        if (timeLeft <= 0) return;
        const val = parseInt(inputEl.value);
        if (val === answer) { score++; scoreEl.textContent = `${score} correct`; }
        newProblem();
      }

      submitBtn.addEventListener("click", submit);
      inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });

      newProblem();
      this._interval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;
        if (timeLeft <= 5) timerEl.style.color = "var(--danger)";
        if (timeLeft <= 0) {
          clearInterval(this._interval);
          const coins = Math.min(50, score * 5);
          statusEl.innerHTML = `<strong>Time's up! ${score} correct → ${coins} coins</strong>`;
          inputEl.disabled = true; submitBtn.disabled = true;
          onComplete(coins);
        }
      }, 1000);
    },
    cleanup() { if (this._interval) clearInterval(this._interval); }
  }
};
