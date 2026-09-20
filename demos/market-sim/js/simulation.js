// Pętla i stan symulacji — czysta logika, bez DOM.
'use strict';

class Simulation {
  constructor() { this.reset(); }

  reset() {
    _orderId = 1;
    this.book = new OrderBook();
    this.engine = new MatchingEngine(this.book);
    this.tick = 0;
    this.lastPriceCents = CFG.startPriceCents;
    this.history = [CFG.startPriceCents];
    this.volumeHist = [];
    this.volumeTotal = 0;
    this.volumeThisTick = 0;
    this._takerThisTick = 0;
    this._makerThisTick = 0;
    this.takerWindow = [];
    this.makerWindow = [];
    this.heatmap = [];
    this.baseCandles = [];
    this._curBase = null;
    this._tvpBucket = new Map();
    this._tvpTick = new Map();
    this.supportCents = null;
    this.resistanceCents = null;
    this.lastUserFill = null;
    this.eventBanner = null;
    this.noLiquidity = false;

    let id = 1;
    this.marketMaker = new MarketMaker(id++);
    this.noiseTraders = []; for (let i = 0; i < CFG.noiseCount; i++) this.noiseTraders.push(new NoiseTrader(id++));
    this.trendFollowers = []; for (let i = 0; i < CFG.trendCount; i++) this.trendFollowers.push(new TrendFollower(id++));
    this.whale = new Whale(id++);

    this.enableNoise = true; this.enableTrend = true; this.enableWhale = true;
    this.pendingUserOrders = [];
    this.running = false;
  }

  ctx() { return { book: this.book, lastPriceCents: this.lastPriceCents, history: this.history, tick: this.tick }; }

  routeOrder(order) {
    const r = this.engine.executeOrder(order, this._tvpTick);
    if (r.filled > 0) {
      this.lastPriceCents = r.lastTradeCents;
      this.volumeThisTick += r.filled;
      this._takerThisTick += r.filled;
    }

    if (r.restedQty > 0) this._makerThisTick += r.restedQty;
    return r;
  }

  submitUserOrder(order) { order.tag = order.tag || 'user'; this.pendingUserOrders.push(order); }

  step(doSnapshot = true) {
    this.tick++;
    this.volumeThisTick = 0; this._takerThisTick = 0; this._makerThisTick = 0;
    this._tvpTick.clear();

    const mmOrders = this.marketMaker.replenish(this.ctx());
    for (const o of mmOrders) { this.book.addOrder(o); this._makerThisTick += o.qty; }

    if (this.enableNoise) for (const a of this.noiseTraders) { const o = a.act(this.ctx()); if (o) this.routeOrder(o); }
    if (this.enableTrend) for (const a of this.trendFollowers) { const o = a.act(this.ctx()); if (o) this.routeOrder(o); }
    if (this.enableWhale) { const o = this.whale.act(this.ctx()); if (o) this.routeOrder(o); }

    for (const o of this.pendingUserOrders) {
      const before = this.lastPriceCents;
      const r = this.routeOrder(o);
      const info = { side: o.side, type: o.type, filled: r.filled, requested: o.qty,
                     vwapCents: r.filled ? r.notionalCents / r.filled : null, moveCents: this.lastPriceCents - before };
      if (o.tag === 'whale') this.eventBanner = info;
      else { this.lastUserFill = info; this.noLiquidity = (r.filled === 0 && o.type === 'market'); }
    }
    this.pendingUserOrders = [];

    const cr = this.engine.clearCrossedBook(this.lastPriceCents, this._tvpTick);
    if (cr.filled > 0) { this.lastPriceCents = cr.lastTradeCents; this.volumeThisTick += cr.filled; this._takerThisTick += cr.filled; }

    this.lastPriceCents = clamp(this.lastPriceCents, CFG.priceFloorCents, CFG.priceCeilCents);

    this.book.cancelStale(this.tick);

    this.volumeTotal += this.volumeThisTick;
    this.history.push(this.lastPriceCents); if (this.history.length > CFG.maxHistory) this.history.shift();
    this.volumeHist.push(this.volumeThisTick); if (this.volumeHist.length > CFG.maxHistory) this.volumeHist.shift();
    this.takerWindow.push(this._takerThisTick); this.makerWindow.push(this._makerThisTick);
    if (this.takerWindow.length > 50) { this.takerWindow.shift(); this.makerWindow.shift(); }

    const baseTicks = Math.max(1, Math.round(60 / CFG.marketSecPerTick));
    const mi = Math.floor(this.tick / baseTicks), p = this.lastPriceCents;
    if (!this._curBase || this._curBase.m !== mi) {
      if (this._curBase) {
        const mid = (this._curBase.h + this._curBase.l) / 2;
        this._curBase.prof = compactProf(this.book.depthProfile(CFG.depthBinCents), this.lastPriceCents, CFG.bookNearCents);
        this._curBase.tvp = compactMap(this._tvpBucket, mid, CFG.bookNearCents);
        this.baseCandles.push(this._curBase);
        if (this.baseCandles.length > CFG.maxBaseCandles) this.baseCandles.shift();

        const oldIdx = this.baseCandles.length - 1 - CFG.bookProfWindow;
        if (oldIdx >= 0 && this.baseCandles[oldIdx].prof) this.baseCandles[oldIdx].prof = null;
        if (oldIdx >= 0 && this.baseCandles[oldIdx].tvp) this.baseCandles[oldIdx].tvp = null;
        this._tvpBucket.clear();
      }
      const open = this._curBase ? this._curBase.c : p;
      this._curBase = { m: mi, o: open, h: Math.max(open, p), l: Math.min(open, p), c: p, prof: null, tvp: null };
    } else {
      if (p > this._curBase.h) this._curBase.h = p;
      if (p < this._curBase.l) this._curBase.l = p;
      this._curBase.c = p;
    }

    for (const [k, v] of this._tvpTick) this._tvpBucket.set(k, (this._tvpBucket.get(k) || 0) + v);

    if (doSnapshot) {
      const prof = this.book.depthProfile(CFG.depthBinCents);
      this._updateSupportResistance(prof);
      this.heatmap.push({ tick: this.tick, priceCents: this.lastPriceCents, prof });
      if (this.heatmap.length > CFG.bookHistoryTicks) this.heatmap.shift();

      if (this._curBase) {
        this._curBase.prof = compactProf(prof, this.lastPriceCents, CFG.bookNearCents);
        this._curBase.tvp = compactMap(this._tvpBucket, (this._curBase.h + this._curBase.l) / 2, CFG.bookNearCents);
      }
    }
  }

  marketTimeSec() { return this.tick * CFG.marketSecPerTick; }

  takerMakerRatio() {
    const t = this.takerWindow.reduce((a, b) => a + b, 0);
    const m = this.makerWindow.reduce((a, b) => a + b, 0);
    return m > 0 ? t / m : 0;
  }

  _updateSupportResistance(prof) {
    const price = this.lastPriceCents;
    let sup = null, supQ = 0, res = null, resQ = 0;
    for (const [p, q] of prof.bids) if (p < price && q > supQ) { supQ = q; sup = p; }
    for (const [p, q] of prof.asks) if (p > price && q > resQ) { resQ = q; res = p; }
    this.supportCents = sup; this.resistanceCents = res;
  }

  fireWhale(side) {
    const size = CFG.whaleButtonMin + Math.floor(Math.random() * (CFG.whaleButtonMax - CFG.whaleButtonMin + 1));
    const o = new Order(side, 'market', 0, size, this.whale.id, this.tick); o.tag = 'whale';
    this.pendingUserOrders.push(o);
  }
}

