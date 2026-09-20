// Zlecenie (Order) i księga zleceń (OrderBook): ceny w centach, priorytet cena-czas.
'use strict';

let _orderId = 1;
class Order {
  constructor(side, type, priceCents, qty, agentId, bornTick, isMM = false) {
    this.id = _orderId++;
    this.side = side;
    this.type = type;
    this.priceCents = priceCents;
    this.qty = qty;
    this.agentId = agentId;
    this.bornTick = bornTick;
    this.isMM = isMM;
    this.tag = null;
  }
}

class OrderBook {
  constructor() { this.bids = []; this.asks = []; }

  bestBid() { return this.bids.length ? this.bids[0].priceCents : null; }
  bestAsk() { return this.asks.length ? this.asks[0].priceCents : null; }
  spread() { const b = this.bestBid(), a = this.bestAsk(); return (b != null && a != null) ? a - b : null; }
  mid() { const b = this.bestBid(), a = this.bestAsk(); return (b != null && a != null) ? (a + b) / 2 : null; }

  addOrder(o) {
    const book = o.side === 'buy' ? this.bids : this.asks;
    let i = 0;
    if (o.side === 'buy') { while (i < book.length && book[i].priceCents >= o.priceCents) i++; }
    else { while (i < book.length && book[i].priceCents <= o.priceCents) i++; }
    book.splice(i, 0, o);
  }

  cancelStale(tick) {
    const cut = CFG.staleTicks, mmCut = CFG.staleTicks * CFG.mmStaleMult;
    const alive = o => (tick - o.bornTick) <= (o.isMM ? mmCut : cut);
    this.bids = this.bids.filter(alive);
    this.asks = this.asks.filter(alive);

    if (this.bids.length > CFG.maxBookPerSide) this.bids.length = CFG.maxBookPerSide;

    if (this.asks.length > CFG.maxBookPerSide) this.asks.length = CFG.maxBookPerSide;
  }

  depthProfile(binCents) {
    const agg = book => {
      const m = new Map();
      for (const o of book) { const b = Math.floor(o.priceCents / binCents) * binCents; m.set(b, (m.get(b) || 0) + o.qty); }
      return m;
    };
    return { bids: agg(this.bids), asks: agg(this.asks) };
  }
}

