// stocks.js — Fake stock market
(function() {
  window.StockMarket = {
    async load(container) {
      container.innerHTML = '<p style="text-align:center;color:var(--ink3)">Loading market...</p>';
      try {
        const res = await fetch('/api/stocks');
        const data = await res.json();
        this.render(container, data);
      } catch { container.innerHTML = '<p style="color:var(--danger)">Failed to load market</p>'; }
    },

    render(container, data) {
      const { stocks, portfolio, cash } = data;
      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div><span style="font-weight:800;font-size:20px;color:var(--deep)">💰 Cash: $${cash.toFixed(2)}</span></div>
          <div><span style="font-weight:700;font-size:14px;color:var(--ink2)">Portfolio Value: $${this.portfolioValue(stocks, portfolio, cash).toFixed(2)}</span></div>
        </div>
        <div id="stock-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px"></div>
      `;
      const grid = document.getElementById('stock-grid');
      for (const s of stocks) {
        const held = portfolio[s.id] || 0;
        const change = s.history.length > 1 ? s.price - s.history[s.history.length - 2] : 0;
        const changePct = s.history.length > 1 ? (change / s.history[s.history.length - 2] * 100) : 0;
        const up = change >= 0;

        const card = document.createElement('div');
        card.style.cssText = 'padding:16px;background:var(--neo);border-radius:14px;box-shadow:inset 2px 2px 4px var(--neo-lo),inset -2px -2px 4px var(--neo-hi)';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div><span style="font-weight:800;font-size:16px;color:var(--deep)">${s.emoji} ${s.name}</span><br><span style="font-size:11px;color:var(--ink3)">${s.ticker}</span></div>
            <div style="text-align:right"><span style="font-weight:800;font-size:20px;color:var(--deep)">$${s.price.toFixed(2)}</span><br><span style="font-size:13px;font-weight:700;color:${up?'var(--success)':'var(--danger)'}">${up?'▲':'▼'} ${Math.abs(change).toFixed(2)} (${Math.abs(changePct).toFixed(1)}%)</span></div>
          </div>
          <canvas id="chart-${s.id}" width="260" height="60" style="width:100%;height:60px;border-radius:8px;margin-bottom:8px"></canvas>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
            <span style="color:var(--ink2)">You own: <strong>${held}</strong></span>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" style="background:var(--success);color:#fff;font-size:12px;padding:4px 12px" data-action="buy" data-stock="${s.id}">Buy</button>
              <button class="btn btn-sm" style="background:var(--danger);color:#fff;font-size:12px;padding:4px 12px" ${held<=0?'disabled':''} data-action="sell" data-stock="${s.id}">Sell</button>
            </div>
          </div>
        `;
        grid.appendChild(card);

        // Draw mini chart
        const canvas = document.getElementById(`chart-${s.id}`);
        if (canvas) this.drawChart(canvas, s.history, up);
      }

      // Wire buy/sell buttons
      grid.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;
          const stockId = btn.dataset.stock;
          try {
            const res = await fetch(`/api/stocks/${action}`, {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ stockId, amount: 1 })
            });
            const d = await res.json();
            if (!res.ok) { alert(d.error); return; }
            this.load(container); // refresh
          } catch {}
        });
      });
    },

    drawChart(canvas, history, up) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (history.length < 2) return;
      const min = Math.min(...history) * 0.98;
      const max = Math.max(...history) * 1.02;
      const range = max - min || 1;

      // Gradient fill
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      if (up) { grad.addColorStop(0, 'rgba(76,175,80,0.3)'); grad.addColorStop(1, 'rgba(76,175,80,0)'); }
      else { grad.addColorStop(0, 'rgba(224,72,88,0.3)'); grad.addColorStop(1, 'rgba(224,72,88,0)'); }

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < history.length; i++) {
        const x = (i / (history.length - 1)) * w;
        const y = h - ((history[i] - min) / range) * h;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = (i / (history.length - 1)) * w;
        const y = h - ((history[i] - min) / range) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = up ? '#4caf50' : '#e04858';
      ctx.lineWidth = 2;
      ctx.stroke();
    },

    portfolioValue(stocks, portfolio, cash) {
      let val = cash;
      for (const s of stocks) { val += (portfolio[s.id] || 0) * s.price; }
      return val;
    }
  };
})();
