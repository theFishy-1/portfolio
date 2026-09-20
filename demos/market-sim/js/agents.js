// Uczestnicy rynku: animator (MarketMaker), trader szumowy, trend, wieloryb.
'use strict';

class Agent { constructor(id) { this.id = id; } act() { return null; } }

class MarketMaker extends Agent {
  replenish(ctx) {
    const orders = [];
    const center = snapToTick(ctx.lastPriceCents);

    const bq = new Map(), aq = new Map();
    for (const o of ctx.book.bids) bq.set(o.priceCents, (bq.get(o.priceCents) || 0) + o.qty);
    for (const o of ctx.book.asks) aq.set(o.priceCents, (aq.get(o.priceCents) || 0) + o.qty);

    for (let k = 0; k < CFG.mmLevels; k++) {
      const dist = (CFG.mmInnerTicks + k) * CFG.tickCents;
      const bidP = center - dist;
      const askP = center + dist;
      if (bidP >= CFG.priceFloorCents) {
        const have = bq.get(bidP) || 0;
        if (have < CFG.mmTargetDepth) orders.push(new Order('buy', 'limit', bidP, CFG.mmTargetDepth - have, this.id, ctx.tick, true));
      }
      if (askP <= CFG.priceCeilCents) {
        const have = aq.get(askP) || 0;
        if (have < CFG.mmTargetDepth) orders.push(new Order('sell', 'limit', askP, CFG.mmTargetDepth - have, this.id, ctx.tick, true));
      }
    }
    return orders;
  }
}

class NoiseTrader extends Agent {
  act(ctx) {
    if (Math.random() >= CFG.noiseActProb) return null;
    const side = Math.random() < 0.5 ? 'buy' : 'sell';
    const size = clamp(Math.floor(1 + expSample(CFG.noiseSizeMean)), 1, CFG.noiseMaxSize);
    if (Math.random() < CFG.noiseMarketProb) return new Order(side, 'market', 0, size, this.id, ctx.tick);

    const center = snapToTick(ctx.lastPriceCents);
    const off = (1 + Math.floor(Math.random() * CFG.noiseLimitOffsetMax)) * CFG.tickCents;
    const price = side === 'buy' ? center - off : center + off;
    return new Order(side, 'limit', price, size, this.id, ctx.tick);
  }
}

class TrendFollower extends Agent {
  act(ctx) {
    const h = ctx.history;
    if (h.length < CFG.trendLookback + 1) return null;
    const momentum = h[h.length - 1] - h[h.length - 1 - CFG.trendLookback];
    const pAct = Math.min(CFG.trendPactMax, Math.abs(momentum) * CFG.trendPactPerCent);
    if (momentum === 0 || Math.random() >= pAct) return null;
    const side = momentum > 0 ? 'buy' : 'sell';
    const size = Math.floor(CFG.trendMinSize + Math.random() * CFG.trendSizeRange);
    if (Math.random() < CFG.trendMarketProb) return new Order(side, 'market', 0, size, this.id, ctx.tick);
    const center = snapToTick(ctx.lastPriceCents);
    const price = side === 'buy' ? center - CFG.tickCents : center + CFG.tickCents;
    return new Order(side, 'limit', price, size, this.id, ctx.tick);
  }
}

class Whale extends Agent {
  act(ctx) {
    if (Math.random() >= CFG.whaleProb) return null;
    const size = CFG.whaleMin + Math.floor(Math.random() * (CFG.whaleMax - CFG.whaleMin + 1));
    return this.makeOrder(ctx, size);
  }
  makeOrder(ctx, size, forcedSide = null) {
    let side = forcedSide;
    if (!side) {
      const h = ctx.history;
      const momentum = h.length > CFG.trendLookback ? h[h.length - 1] - h[h.length - 1 - CFG.trendLookback] : 0;
      if (momentum !== 0 && Math.random() < CFG.whaleTrendBias) side = momentum > 0 ? 'buy' : 'sell';
      else side = Math.random() < 0.5 ? 'buy' : 'sell';
    }
    return new Order(side, 'market', 0, size, this.id, ctx.tick);
  }
}

