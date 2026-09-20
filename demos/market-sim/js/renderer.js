// Renderer — całe rysowanie i interakcja z DOM.
'use strict';

let SUPPORT_CENTS = null, RESISTANCE_CENTS = null;

class Renderer {
  constructor(sim) {
    this.sim = sim;
    this.timeframe = 1;
    this.chartType = 'line';
    this.showBook = true;
    this.bookMode = 'rest';
    this.visibleBars = CFG.defaultVisibleBars;
    this.depth = this._setupCanvas('depthCanvas', 300);
    this.heat = this._setupCanvas('heatCanvas', 260);
    this.candle = this._setupCanvas('candleCanvas', this._candleHeight());
    this._initPriceChart();
    window.addEventListener('resize', () => {
      this.depth = this._setupCanvas('depthCanvas', 300);
      this.heat = this._setupCanvas('heatCanvas', 260);
      if (this.chartType === 'candles') this.candle = this._setupCanvas('candleCanvas', this._candleHeight());
      this.render();
    });
  }

  _candleHeight() {
    const wrap = document.querySelector('.chart-wrap');
    return (wrap && wrap.clientHeight) ? wrap.clientHeight : 320;
  }

  _setupCanvas(id, cssHeight) {
    const cv = document.getElementById(id);
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || cv.parentElement.clientWidth || 600;
    const h = cssHeight;
    cv.style.height = h + 'px';
    cv.width = Math.max(1, Math.floor(w * dpr));
    cv.height = Math.max(1, Math.floor(h * dpr));
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cv, ctx, w, h };
  }

  _initPriceChart() {
    const el = document.getElementById('priceChart');
    if (typeof Chart === 'undefined') {
      el.parentElement.innerHTML = '<p style="color:#ffd76a">Nie udało się załadować Chart.js (brak internetu?). ' +
        'Wykres głębokości i mapa cieplna działają bez niego.</p>';
      this.priceChart = null; return;
    }
    const self = this;
    const srPlugin = {
      id: 'srBands',

      beforeDatasetsDraw(chart) {
        if (!self.showBook) return;
        const candles = self._buildCandles(); if (!candles.length) return;
        const xs = chart.scales.x, ys = chart.scales.y, a = chart.chartArea, ctx = chart.ctx;
        const colW = candles.length > 1 ? Math.max(1, Math.abs(xs.getPixelForValue(1) - xs.getPixelForValue(0))) : (a.right - a.left);
        ctx.save(); ctx.beginPath(); ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top); ctx.clip();
        self._drawBookHistory(ctx, {
          candles, xLeft: i => xs.getPixelForValue(i) - colW / 2, colW: colW + 0.5,
          yFn: c => ys.getPixelForValue(c / 100), loC: ys.min * 100, hiC: ys.max * 100
        });
        ctx.restore();
      },
      afterDatasetsDraw(chart) {
        const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
        const band = (cents, color, label) => {
          if (cents == null) return;
          const yp = y.getPixelForValue(cents / 100);
          if (!isFinite(yp)) return;
          ctx.save();
          ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(left, yp); ctx.lineTo(right, yp); ctx.stroke();
          ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = '11px Segoe UI, Arial';
          ctx.fillText(label + ' ≈ ' + (cents / 100).toFixed(2), left + 6, yp - 4);
          ctx.restore();
        };
        band(SUPPORT_CENTS, 'rgba(79,209,126,0.95)', 'Wsparcie');
        band(RESISTANCE_CENTS, 'rgba(255,118,118,0.95)', 'Opór');

        if (self.showBook) {
          const ladderW = Math.min(70, (right - left) * 0.12), xStart = right - ladderW;
          ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(xStart, top); ctx.lineTo(xStart, bottom); ctx.stroke();
          ctx.beginPath(); ctx.rect(xStart, top, ladderW, bottom - top); ctx.clip();
          self._drawLiveBook(ctx, { xStart: xStart + 1, width: ladderW - 2, yFn: c => y.getPixelForValue(c / 100), loC: y.min * 100, hiC: y.max * 100 });
          ctx.restore();
        }
      }
    };
    this.priceChart = new Chart(el.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Cena', data: [], borderColor: '#f0c800', backgroundColor: 'rgba(240,200,0,0.08)', fill: true, borderWidth: 2, pointRadius: 0, tension: 0.15 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { labels: { color: '#e6ebf5' } } },
        scales: {
          x: { ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#9aa6bd' }, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'Cena', color: '#9aa6bd' } }
        }
      },
      plugins: [srPlugin]
    });
  }

  render() {
    const s = this.sim;
    SUPPORT_CENTS = s.supportCents; RESISTANCE_CENTS = s.resistanceCents;
    this._renderKPI();
    this._renderPrice();
    this._renderDepth();
    this._renderHeatmap();
    this._renderBook();
    this._renderStatus();

    s.lastUserFill = null; s.eventBanner = null; s.noLiquidity = false;
  }

  renderSpeedHud(requested, achieved) {
    const el = document.getElementById('speedReadout');
    if (!el) return;
    let txt = 'Rzeczywiście: ~' + fmtRate(achieved);
    if (achieved < requested * 0.9) txt += ' (limit wydajności)';
    el.textContent = txt;
  }

  _renderKPI() {
    const s = this.sim;
    const bid = s.book.bestBid(), ask = s.book.bestAsk(), sp = s.book.spread();
    document.getElementById('k-price').textContent = fmt(s.lastPriceCents);
    document.getElementById('k-bid').textContent = bid != null ? fmt(bid) : '—';
    document.getElementById('k-ask').textContent = ask != null ? fmt(ask) : '—';
    document.getElementById('k-spread').textContent = sp != null ? fmt(sp) : '—';
    document.getElementById('k-vol').textContent = s.volumeThisTick;
    document.getElementById('k-voltot').textContent = s.volumeTotal;
    document.getElementById('k-clock').textContent = fmtMarketTime(s.marketTimeSec());
    document.getElementById('k-tick').textContent = 'tura ' + s.tick;
    const r = s.takerMakerRatio();
    const el = document.getElementById('k-ratio');
    el.textContent = r.toFixed(2);

    el.className = 'badge ' + (r >= 0.4 && r <= 1.6 ? 'ok' : 'warn');
  }

  setTimeframe(tf) { this.timeframe = Math.max(1, tf | 0); this._renderPrice(); }

  setChartType(type) {
    this.chartType = (type === 'candles') ? 'candles' : 'line';
    const pc = document.getElementById('priceChart');
    const cc = document.getElementById('candleCanvas');
    if (this.chartType === 'candles') {
      if (pc) pc.style.display = 'none';
      cc.style.display = 'block';
      this.candle = this._setupCanvas('candleCanvas', this._candleHeight());
    } else {
      cc.style.display = 'none';
      if (pc) pc.style.display = 'block';
      if (this.priceChart) this.priceChart.resize();
    }
    this._renderPrice();
  }

  _buildCandles() {
    const tf = this.timeframe || 1;
    const baseTicks = Math.max(1, Math.round(60 / CFG.marketSecPerTick));
    if (tf >= baseTicks) return this._buildCandlesFromBase(tf, baseTicks);
    return this._buildCandlesFromTicks(tf);
  }

  _buildCandlesFromBase(tf, baseTicks) {
    const all = this.sim.baseCandles, cur = this.sim._curBase;
    if (!all.length && !cur) return [];
    const tfMin = Math.max(1, Math.round(tf / baseTicks));
    const lastM = cur ? cur.m : all[all.length - 1].m;
    const minM = (Math.floor(lastM / tfMin) - this.visibleBars + 1) * tfMin;
    const baseM0 = all.length ? all[0].m : cur.m;
    let startIdx = Math.max(0, minM - baseM0);

    const startM = baseM0 + startIdx;
    const alignedIdx = Math.ceil(startM / tfMin) * tfMin - baseM0;
    if (alignedIdx > startIdx && alignedIdx < all.length) startIdx = alignedIdx;
    const out = [];
    const consume = bc => {
      const bucket = Math.floor(bc.m / tfMin), c = out.length ? out[out.length - 1] : null;
      if (!c || c.b !== bucket) out.push({ b: bucket, o: bc.o, h: bc.h, l: bc.l, c: bc.c });
      else { if (bc.h > c.h) c.h = bc.h; if (bc.l < c.l) c.l = bc.l; c.c = bc.c; }
    };
    for (let i = startIdx; i < all.length; i++) consume(all[i]);
    if (cur) consume(cur);
    return out;
  }

  _buildCandlesFromTicks(tf) {
    const raw = this.sim.history, n = raw.length;
    if (n === 0) return [];
    const firstAbs = this.sim.tick - (n - 1);
    const lastBucket = Math.floor((firstAbs + n - 1) / tf);
    let startI = Math.max(0, (lastBucket - this.visibleBars + 1) * tf - firstAbs);

    const firstFull = (tf - (firstAbs % tf)) % tf;
    if (firstFull > startI && firstFull < n) startI = firstFull;
    const out = [];
    for (let i = startI; i < n; i++) {
      const b = Math.floor((firstAbs + i) / tf), p = raw[i];
      const cur = out.length ? out[out.length - 1] : null;
      if (!cur || cur.b !== b) {
        const open = cur ? cur.c : (i > 0 ? raw[i - 1] : p);
        out.push({ b, o: open, h: Math.max(open, p), l: Math.min(open, p), c: p });
      } else {
        if (p > cur.h) cur.h = p;
        if (p < cur.l) cur.l = p;
        cur.c = p;
      }
    }
    return out;
  }

  setShowBook(v) { this.showBook = !!v; this._renderPrice(); }
  setBookMode(m) { this.bookMode = (m === 'volume') ? 'volume' : 'rest'; this._renderPrice(); }
  zoom(factor) {
    this.visibleBars = Math.round(clamp(this.visibleBars * factor, CFG.minVisibleBars, CFG.maxVisibleBars));
    this._renderPrice();
  }

  _bookByBucket() {
    const tf = this.timeframe || 1;
    const baseTicks = Math.max(1, Math.round(60 / CFG.marketSecPerTick));
    const all = this.sim.baseCandles, cur = this.sim._curBase, m = new Map();
    // Aggregate (SUM) the per-minute book snapshots in each bucket, tracking the count `n`, so the
    // drawer can show AVERAGE depth/price over the period. (Overwriting kept only the last minute →
    // bands clustered at each candle's close on high TFs.) At 1m (tfMin=1) n=1 ⇒ unchanged.
    const addInto = (bucket, prof) => {
      if (!prof) return;
      let acc = m.get(bucket); if (!acc) { acc = { bids: new Map(), asks: new Map(), n: 0 }; m.set(bucket, acc); }
      acc.n++;
      const b = prof.bids; for (let k = 0; k < b.length; k += 2) acc.bids.set(b[k], (acc.bids.get(b[k]) || 0) + b[k + 1]);
      const a = prof.asks; for (let k = 0; k < a.length; k += 2) acc.asks.set(a[k], (acc.asks.get(a[k]) || 0) + a[k + 1]);
    };
    if (tf >= baseTicks) {
      const tfMin = Math.max(1, Math.round(tf / baseTicks));
      for (let i = Math.max(0, all.length - CFG.bookProfWindow); i < all.length; i++)
        if (all[i].prof) addInto(Math.floor(all[i].m / tfMin), all[i].prof);
      if (cur && cur.prof) addInto(Math.floor(cur.m / tfMin), cur.prof);
    } else {

      const need = Math.ceil(CFG.maxHistory / baseTicks) + 2, start = Math.max(0, all.length - need);
      const span = bc => { if (!bc.prof) return; const t0 = bc.m * baseTicks, b0 = Math.floor(t0 / tf), b1 = Math.floor((t0 + baseTicks - 1) / tf); for (let b = b0; b <= b1; b++) addInto(b, bc.prof); };
      for (let i = start; i < all.length; i++) span(all[i]);
      if (cur) span(cur);
    }
    return m;
  }

  _tvpByBucket() {
    const tf = this.timeframe || 1;
    const baseTicks = Math.max(1, Math.round(60 / CFG.marketSecPerTick));
    const all = this.sim.baseCandles, cur = this.sim._curBase, m = new Map();
    // Per bucket: SUM traded volume per price + count `n` minutes, so the drawer normalises to avg
    // volume/min (keeps opacity in the per-minute `tvpScale` range across timeframes). `n` counts every
    // in-window minute (incl. zero-trade ones) so the average isn't biased high.
    const addInto = (bucket, arr) => {
      let acc = m.get(bucket); if (!acc) { acc = { map: new Map(), n: 0 }; m.set(bucket, acc); }
      acc.n++;
      if (arr) for (let k = 0; k < arr.length; k += 2) acc.map.set(arr[k], (acc.map.get(arr[k]) || 0) + arr[k + 1]);
    };
    if (tf >= baseTicks) {
      const tfMin = Math.max(1, Math.round(tf / baseTicks));

      for (let i = Math.max(0, all.length - CFG.bookProfWindow); i < all.length; i++)
        if (all[i].tvp) addInto(Math.floor(all[i].m / tfMin), all[i].tvp);
      if (cur && cur.tvp) addInto(Math.floor(cur.m / tfMin), cur.tvp);
    } else {

      const need = Math.ceil(CFG.maxHistory / baseTicks) + 2, start = Math.max(0, all.length - need);
      const span = bc => { if (!bc.tvp) return; const t0 = bc.m * baseTicks, b0 = Math.floor(t0 / tf), b1 = Math.floor((t0 + baseTicks - 1) / tf); for (let b = b0; b <= b1; b++) addInto(b, bc.tvp); };
      for (let i = start; i < all.length; i++) span(all[i]);
      if (cur) span(cur);
    }
    return m;
  }

  _drawBookHistory(ctx, g) {
    const baseTicks = Math.max(1, Math.round(60 / CFG.marketSecPerTick));
    // Overlay data (resting prof + traded volume) is captured per market-minute; below 1m it would
    // smear one minute's profile across every sub-candle → staircase blocks. Hide it silently.
    if (this.timeframe < baseTicks) return;
    if (this.bookMode === 'volume') { this._drawTradedVolume(ctx, g); return; }
    const byB = this._bookByBucket(), tvpB = this._tvpByBucket(), scale = CFG.mmTargetDepth;

    const gap = Math.abs(g.yFn(0) - g.yFn(CFG.depthBinCents));
    const th = Math.max(1, gap * 0.9);
    for (let i = 0; i < g.candles.length; i++) {
      const prof = byB.get(g.candles[i].b); if (!prof) continue;
      const x0 = g.xLeft(i), tvp = tvpB.get(g.candles[i].b);
      const pn = prof.n || 1, tn = tvp ? (tvp.n || 1) : 1;

      const paint = (map, r, gr, b) => {
        for (const [p, q] of map) {
          if (p < g.loC || p > g.hiC) continue;
          const yy = g.yFn(p) - th / 2;
          const a = clamp(0.06 + ((q / pn) / scale) * 0.6, 0.06, 0.85);
          ctx.fillStyle = 'rgba(' + r + ',' + gr + ',' + b + ',' + a + ')';
          ctx.fillRect(x0, yy, g.colW, th);
          const traded = tvp ? (tvp.map.get(p) || 0) / tn : 0;
          if (traded) {
            const ta = clamp((traded / CFG.tvpScale) * 0.75, 0.05, 0.8);
            ctx.fillStyle = 'rgba(255,240,170,' + ta + ')';
            ctx.fillRect(x0, yy, g.colW, th);
          }
        }
      };
      paint(prof.bids, 45, 195, 105);
      paint(prof.asks, 230, 72, 72);
    }
  }

  _drawTradedVolume(ctx, g) {
    const tvpB = this._tvpByBucket();
    const gap = Math.abs(g.yFn(0) - g.yFn(CFG.depthBinCents));
    const th = Math.max(1, gap * 0.9);
    for (let i = 0; i < g.candles.length; i++) {
      const e = tvpB.get(g.candles[i].b); if (!e) continue;
      const x0 = g.xLeft(i), n = e.n || 1;
      for (const [p, q] of e.map) {
        if (p < g.loC || p > g.hiC) continue;
        const a = clamp(0.05 + ((q / n) / CFG.tvpScale) * 0.7, 0.05, 0.9);
        ctx.fillStyle = 'rgba(240,200,0,' + a + ')';
        ctx.fillRect(x0, g.yFn(p) - th / 2, g.colW, th);
      }
    }
  }

  _drawLiveBook(ctx, g) {
    const prof = this.sim.book.depthProfile(CFG.depthBinCents);
    let maxQ = 1;
    for (const [p, q] of prof.bids) if (p >= g.loC && p <= g.hiC) maxQ = Math.max(maxQ, q);
    for (const [p, q] of prof.asks) if (p >= g.loC && p <= g.hiC) maxQ = Math.max(maxQ, q);
    const bar = (map, col) => {
      for (const [p, q] of map) {
        if (p < g.loC || p > g.hiC) continue;
        ctx.fillStyle = col;
        ctx.fillRect(g.xStart, g.yFn(p) - 1.5, Math.max(1, (q / maxQ) * g.width), 3);
      }
    };
    bar(prof.bids, 'rgba(60,210,120,0.95)');
    bar(prof.asks, 'rgba(255,90,90,0.95)');
  }

  _renderPrice() {
    if (this.chartType === 'candles') { this._renderCandles(); return; }
    if (!this.priceChart) return;

    const closes = this._buildCandles().map(k => k.c / 100);
    this.priceChart.data.labels = closes.map((_, i) => i);
    this.priceChart.data.datasets[0].data = closes;
    this.priceChart.update('none');
  }

  _renderCandles() {
    const { ctx, w, h } = this.candle;
    ctx.clearRect(0, 0, w, h);
    const candles = this._buildCandles();
    if (!candles.length) return;
    const ladderW = this.showBook ? Math.min(78, w * 0.12) : 0;
    const cw = w - ladderW;
    let lo = Infinity, hi = -Infinity;
    for (const k of candles) { if (k.l < lo) lo = k.l; if (k.h > hi) hi = k.h; }
    const pad = Math.max(15, (hi - lo) * 0.08); lo -= pad; hi += pad;
    if (hi - lo < 1) { hi += 50; lo -= 50; }
    const y = c => h - ((c - lo) / (hi - lo)) * h;
    const n = candles.length;
    const slot = Math.min(cw / n, 30);
    const xOff = cw - slot * n;

    if (this.showBook) this._drawBookHistory(ctx, { candles, xLeft: i => xOff + i * slot, colW: Math.ceil(slot) + 0.5, yFn: y, loC: lo, hiC: hi });

    if (this.timeframe === 1) {
      // 1 tick = surowy wykres tików: każda „świeca" to 1 tick (open≈close, brak ciała) → rysuj linię, nie zdegenerowane świece
      ctx.lineWidth = 1.5;
      for (let i = 1; i < n; i++) {
        const a = candles[i - 1], k = candles[i];
        ctx.strokeStyle = k.c >= a.c ? '#3fcf72' : '#ff5b5b';
        ctx.beginPath();
        ctx.moveTo(xOff + (i - 1) * slot + slot / 2, y(a.c));
        ctx.lineTo(xOff + i * slot + slot / 2, y(k.c));
        ctx.stroke();
      }
    } else {
      const bodyW = Math.max(1, Math.min(slot * 0.7, 16));
      for (let i = 0; i < n; i++) {
        const k = candles[i], x = xOff + i * slot + slot / 2, up = k.c >= k.o;
        const col = up ? '#3fcf72' : '#ff5b5b';
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x, y(k.h)); ctx.lineTo(x, y(k.l)); ctx.stroke();
        const yo = y(k.o), yc = y(k.c), top = Math.min(yo, yc), bh = Math.max(1, Math.abs(yc - yo));
        ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
      }
    }

    const hline = (cents, color, dash) => {
      if (cents == null || cents < lo || cents > hi) return;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(0, y(cents)); ctx.lineTo(w, y(cents)); ctx.stroke(); ctx.restore();
    };
    hline(this.sim.supportCents, 'rgba(79,209,126,0.85)', [6, 4]);
    hline(this.sim.resistanceCents, 'rgba(255,118,118,0.85)', [6, 4]);
    hline(this.sim.lastPriceCents, 'rgba(240,200,0,0.5)', null);

    if (this.showBook) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cw + 0.5, 0); ctx.lineTo(cw + 0.5, h); ctx.stroke(); ctx.restore();
      this._drawLiveBook(ctx, { xStart: cw + 2, width: ladderW - 4, yFn: y, loC: lo, hiC: hi });
    }

    ctx.fillStyle = '#9aa6bd'; ctx.font = '11px Segoe UI, Arial';
    ctx.fillText(fmt(hi), 4, 12); ctx.fillText(fmt(lo), 4, h - 4);
  }

  _renderDepth() {
    const { ctx, w, h } = this.depth;
    const s = this.sim;
    ctx.clearRect(0, 0, w, h);
    const prof = s.book.depthProfile(CFG.depthBinCents);
    const price = s.lastPriceCents;
    const R = 120;
    const pMin = price - R, pMax = price + R;
    const y = c => h - ((c - pMin) / (pMax - pMin)) * h;
    let maxQ = 1;
    for (const [p, q] of prof.bids) if (p >= pMin && p <= pMax) maxQ = Math.max(maxQ, q);
    for (const [p, q] of prof.asks) if (p >= pMin && p <= pMax) maxQ = Math.max(maxQ, q);
    const midX = w / 2;
    const barH = Math.max(2, h / ((pMax - pMin) / CFG.depthBinCents) - 1);

    ctx.fillStyle = 'rgba(20,140,60,0.8)';
    for (const [p, q] of prof.bids) { if (p < pMin || p > pMax) continue; const len = (q / maxQ) * (midX - 6); ctx.fillRect(midX - len, y(p) - barH / 2, len, barH); }
    ctx.fillStyle = 'rgba(200,40,40,0.8)';
    for (const [p, q] of prof.asks) { if (p < pMin || p > pMax) continue; const len = (q / maxQ) * (midX - 6); ctx.fillRect(midX, y(p) - barH / 2, len, barH); }

    ctx.strokeStyle = '#f0c800'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, y(price)); ctx.lineTo(w, y(price)); ctx.stroke();
    ctx.fillStyle = '#9aa6bd'; ctx.font = '11px Segoe UI, Arial';
    ctx.textAlign = 'left'; ctx.fillText(fmt(pMax), 4, 12);
    ctx.fillText(fmt(pMin), 4, h - 4);
    ctx.fillStyle = '#f0c800'; ctx.fillText('cena ' + fmt(price), midX + 6, y(price) - 4);
    ctx.fillStyle = 'rgba(20,140,60,0.95)'; ctx.fillText('KUPNO', 6, y(price) + 14);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,118,118,0.95)'; ctx.fillText('SPRZEDAŻ', w - 6, y(price) + 14);

    ctx.textAlign = 'center';
    if (s.supportCents != null && s.supportCents >= pMin) { ctx.fillStyle = '#4fd17e'; ctx.fillText('WSPARCIE', midX / 2, y(s.supportCents) - 3); }
    if (s.resistanceCents != null && s.resistanceCents <= pMax) { ctx.fillStyle = '#ff7676'; ctx.fillText('OPÓR', midX + midX / 2, y(s.resistanceCents) - 3); }
    ctx.textAlign = 'left';
  }

  _renderHeatmap() {
    const { ctx, w, h } = this.heat;
    const snaps = this.sim.heatmap.slice(-CFG.heatmapTicks);
    ctx.clearRect(0, 0, w, h);
    if (snaps.length === 0) return;
    let lo = Infinity, hi = -Infinity;
    for (const s of snaps) { lo = Math.min(lo, s.priceCents); hi = Math.max(hi, s.priceCents); }

    const ladderSpan = (CFG.mmInnerTicks + CFG.mmLevels) * CFG.tickCents + CFG.depthBinCents;
    const pad = Math.max(ladderSpan, (hi - lo) * 0.3); lo -= pad; hi += pad;
    if (hi - lo < 1) { hi += 50; lo -= 50; }
    const y = c => h - ((c - lo) / (hi - lo)) * h;
    const colW = w / CFG.heatmapTicks;
    const scale = CFG.mmTargetDepth * 2;
    const binPx = Math.max(2, h / ((hi - lo) / CFG.depthBinCents));
    for (let i = 0; i < snaps.length; i++) {
      const sn = snaps[i], x = i * colW;
      const paint = map => {
        for (const [p, q] of map) {
          if (p < lo || p > hi) continue;
          const a = Math.min(1, q / scale); if (a <= 0.02) continue;
          ctx.fillStyle = 'rgba(40,110,230,' + a + ')';
          ctx.fillRect(x, y(p) - binPx / 2, Math.ceil(colW) + 0.5, binPx);
        }
      };
      paint(sn.prof.bids); paint(sn.prof.asks);
    }

    ctx.strokeStyle = 'rgba(240,200,0,0.95)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < snaps.length; i++) {
      const x = i * colW + colW / 2, yy = y(snaps[i].priceCents);
      if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.fillStyle = '#9aa6bd'; ctx.font = '11px Segoe UI, Arial';
    ctx.fillText(fmt(hi), 4, 12); ctx.fillText(fmt(lo), 4, h - 4);
  }

  _renderBook() {
    const s = this.sim;

    const top = (book, n) => {
      const out = []; let last = null;
      for (const o of book) {
        if (last && last.priceCents === o.priceCents) { last.qty += o.qty; continue; }
        if (out.length >= n) break;
        last = { priceCents: o.priceCents, qty: o.qty }; out.push(last);
      }
      return out;
    };
    const bids = top(s.book.bids, 10), asks = top(s.book.asks, 10);
    const tbody = document.querySelector('#bookTable tbody');
    let rows = '';
    const sp = s.book.spread();
    for (let i = 0; i < 10; i++) {
      const b = bids[i], a = asks[i];
      rows += '<tr>' +
        '<td class="bidp">' + (b ? fmt(b.priceCents) : '') + '</td><td>' + (b ? b.qty : '') + '</td>' +
        '<td class="askp">' + (a ? fmt(a.priceCents) : '') + '</td><td>' + (a ? a.qty : '') + '</td></tr>';
      if (i === 0) rows += '<tr class="spreadrow"><td colspan="4">spread ' + (sp != null ? fmt(sp) : '—') + '</td></tr>';
    }
    tbody.innerHTML = rows;
  }

  _renderStatus() {
    const s = this.sim;
    const el = document.getElementById('status');
    const parts = [];
    if (s.eventBanner) {
      const e = s.eventBanner;
      parts.push('🐋 <b>Wieloryb ' + (e.side === 'buy' ? 'KUPIŁ' : 'SPRZEDAŁ') + '</b> ' + e.filled +
        ' szt. — cena przesunęła się o <b>' + (e.moveCents >= 0 ? '+' : '') + fmt(e.moveCents) + '</b>.');
    }
    if (s.lastUserFill) {
      const u = s.lastUserFill;
      if (u.type === 'market') {
        parts.push('Twoje zlecenie RYNKOWE (' + (u.side === 'buy' ? 'kupno' : 'sprzedaż') + '): zrealizowano <b>' +
          u.filled + '/' + u.requested + '</b> szt. po średniej <b>' + (u.vwapCents != null ? fmt(u.vwapCents) : '—') +
          '</b>; cena przesunięta o <b>' + (u.moveCents >= 0 ? '+' : '') + fmt(u.moveCents) + '</b>.' +
          (s.noLiquidity ? ' <span style="color:#ffd76a">Brak płynności po tej stronie.</span>' : ''));
      } else {
        parts.push('Twoje zlecenie z LIMITEM (' + (u.side === 'buy' ? 'kupno' : 'sprzedaż') + '): zrealizowano od razu <b>' +
          u.filled + '/' + u.requested + '</b> szt.; reszta oczekuje w księdze jako Twoja „ściana”.');
      }
    }
    if (parts.length) el.innerHTML = parts.join('<br/>');
  }
}

