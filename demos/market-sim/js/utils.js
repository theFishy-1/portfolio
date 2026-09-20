// Funkcje pomocnicze: formatowanie, próbkowanie, zaokrąglanie do kroku ceny.
'use strict';

const fmt = c => (c / 100).toFixed(2);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const fmtRate = mps => mps >= 86400 ? (mps / 86400).toFixed(mps >= 864000 ? 0 : 1) + ' dni/s'
  : mps >= 3600 ? (mps / 3600).toFixed(1) + ' godz/s'
  : mps >= 60 ? (mps / 60).toFixed(0) + ' min/s'
  : mps.toFixed(0) + ' s/s';

function fmtMarketTime(sec) {
  sec = Math.floor(sec);
  const d = Math.floor(sec / 86400); sec -= d * 86400;
  const h = Math.floor(sec / 3600); sec -= h * 3600;
  const m = Math.floor(sec / 60), s = sec - m * 60, p2 = x => String(x).padStart(2, '0');
  return d > 0 ? d + ' d ' + p2(h) + ':' + p2(m) : h > 0 ? p2(h) + ':' + p2(m) + ':' + p2(s) : p2(m) + ':' + p2(s);
}

function compactMap(map, center, W) {
  const out = [];
  for (const [p, q] of map) if (Math.abs(p - center) <= W) out.push(p, q);
  return out;
}
function compactProf(prof, center, W) {
  return { bids: compactMap(prof.bids, center, W), asks: compactMap(prof.asks, center, W) };
}
const snapToTick = c => Math.round(c / CFG.tickCents) * CFG.tickCents;
function expSample(mean) { let u = Math.random(); if (u <= 0) u = 1e-9; return -mean * Math.log(u); }

