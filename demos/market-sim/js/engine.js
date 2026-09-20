// Silnik dopasowania — jedna ścieżka „chodzenia po księdze” dla wszystkich zleceń.
'use strict';

class MatchingEngine {
  constructor(book) { this.book = book; }

  executeOrder(order, tradeSink = null) {
    const opp = order.side === 'buy' ? this.book.asks : this.book.bids;
    let qty = order.qty, filled = 0, notional = 0, last = null;
    while (qty > 0 && opp.length > 0) {
      const lvl = opp[0];
      if (order.type === 'limit') {
        if (order.side === 'buy' && lvl.priceCents > order.priceCents) break;
        if (order.side === 'sell' && lvl.priceCents < order.priceCents) break;
      }
      const tq = Math.min(qty, lvl.qty);
      lvl.qty -= tq; qty -= tq; filled += tq;
      notional += tq * lvl.priceCents;
      last = lvl.priceCents;
      if (tradeSink) { const bin = Math.floor(lvl.priceCents / CFG.depthBinCents) * CFG.depthBinCents; tradeSink.set(bin, (tradeSink.get(bin) || 0) + tq); }
      if (lvl.qty <= 0) opp.shift();
    }

    let rested = 0;
    if (order.type === 'limit' && qty > 0) { order.qty = qty; this.book.addOrder(order); rested = qty; }
    return { filled, notionalCents: notional, lastTradeCents: last, restedQty: rested };
  }

  clearCrossedBook(refCents, tradeSink = null) {
    const b = this.book.bids, a = this.book.asks;
    let filled = 0, last = null;
    while (b.length > 0 && a.length > 0 && b[0].priceCents >= a[0].priceCents) {
      const bid = b[0], ask = a[0];
      const ref = (refCents == null) ? bid.priceCents : refCents;
      const makerPrice = Math.abs(bid.priceCents - ref) <= Math.abs(ask.priceCents - ref) ? bid.priceCents : ask.priceCents;
      const tq = Math.min(bid.qty, ask.qty);
      bid.qty -= tq; ask.qty -= tq; filled += tq; last = makerPrice;
      if (tradeSink) { const bin = Math.floor(makerPrice / CFG.depthBinCents) * CFG.depthBinCents; tradeSink.set(bin, (tradeSink.get(bin) || 0) + tq); }
      if (bid.qty <= 0) b.shift();
      if (ask.qty <= 0) a.shift();
    }
    return { filled, lastTradeCents: last };
  }
}

