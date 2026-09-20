// Wiązanie z interfejsem: pętla animacji, suwaki, formularz, obsługa błędów.
'use strict';

(function main() {
  try {
    const sim = new Simulation();
    window.__sim = sim;
    const renderer = new Renderer(sim);
    window.__renderer = renderer;

    const btnStart = document.getElementById('btnStart');
    const btnPause = document.getElementById('btnPause');

    function refreshButtons() {
      btnStart.disabled = sim.running; btnPause.disabled = !sim.running;
      btnStart.style.opacity = sim.running ? .5 : 1; btnPause.style.opacity = sim.running ? 1 : .5;
    }

    let rafId = null, lastTs = 0, acc = 0, emaTps = 0;
    const EMA_A = 0.2;
    function runLoop(now) {
      if (!sim.running) return;
      const dtWall = lastTs ? Math.min(0.25, (now - lastTs) / 1000) : (1 / 60);
      lastTs = now;
      acc += CFG.simSpeed * dtWall;
      let steps = Math.floor(acc / CFG.marketSecPerTick);
      if (steps > CFG.maxStepsPerFrame) { steps = CFG.maxStepsPerFrame; acc = 0; }
      else { acc -= steps * CFG.marketSecPerTick; }
      for (let i = 0; i < steps; i++) sim.step(i === steps - 1);
      if (steps > 0) {
        const instTps = steps / dtWall;
        emaTps = emaTps ? emaTps + EMA_A * (instTps - emaTps) : instTps;
        renderer.render();
        renderer.renderSpeedHud(CFG.simSpeed, emaTps * CFG.marketSecPerTick);
      }
      rafId = requestAnimationFrame(runLoop);
    }
    function start() {
      if (rafId) return;
      sim.running = true; lastTs = 0; acc = 0;
      rafId = requestAnimationFrame(runLoop);
      refreshButtons();
    }
    function pause() {
      sim.running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      refreshButtons();
    }

    btnStart.addEventListener('click', start);
    btnPause.addEventListener('click', pause);
    document.getElementById('btnReset').addEventListener('click', () => {
      pause(); sim.reset(); acc = 0; emaTps = 0; lastTs = 0;
      if (renderer.priceChart) { renderer.priceChart.data.labels = []; renderer.priceChart.data.datasets[0].data = []; }
      renderer.render();
    });

    const simSpeedEl = document.getElementById('simSpeed');
    function speedMax() { return CFG.maxStepsPerFrame * 60 * CFG.marketSecPerTick; }
    function applySimSpeed(p) {
      CFG.simSpeed = Math.max(1, Math.round(Math.pow(speedMax(), p / 1000)));
      document.getElementById('simSpeedLabel').textContent = fmtRate(CFG.simSpeed);
    }
    simSpeedEl.addEventListener('input', e => applySimSpeed(parseInt(e.target.value, 10)));

    function applyPace(value) {
      const p = CFG.PACE_PRESETS[value] || CFG.PACE_PRESETS['0.05'];
      CFG.marketSecPerTick = p.marketSecPerTick;
      CFG.mmTargetDepth = p.mmTargetDepth;
      CFG.mmLevels = p.mmLevels;
      CFG.mmInnerTicks = p.mmInnerTicks;
      CFG.tvpScale = p.tvpScale;
      CFG.staleTicks = Math.max(1, Math.round(CFG.staleSeconds / CFG.marketSecPerTick));
    }
    applyPace(document.getElementById('marketPace').value);
    applySimSpeed(parseInt(simSpeedEl.value, 10));

    const TF_DEFS = [['1 tick', null], ['1s', 1], ['5s', 5], ['15s', 15], ['1m', 60],
                     ['5m', 300], ['15m', 900], ['1h', 3600], ['4h', 14400], ['1D', 86400],
                     ['1T', 604800], ['1Mc', 2592000]];
    function rebuildTimeframeOptions() {
      const sel = document.getElementById('timeframe');
      const cur = sel.options[sel.selectedIndex];
      const prevTf = cur ? cur.dataset.tf : null;
      sel.innerHTML = '';
      const seen = new Set();
      for (const [label, sec] of TF_DEFS) {
        const ticks = sec === null ? 1 : Math.max(1, Math.round(sec / CFG.marketSecPerTick));

        if (seen.has(ticks)) continue;
        seen.add(ticks);
        const o = document.createElement('option');
        o.value = String(ticks); o.dataset.tf = label;
        o.textContent = sec === null ? ('1 tick (' + CFG.marketSecPerTick + ' s)') : label;
        sel.appendChild(o);
      }
      let idx = prevTf ? Array.from(sel.options).findIndex(o => o.dataset.tf === prevTf) : -1;
      if (idx < 0) {
        const baseTicks = Math.max(1, Math.round(60 / CFG.marketSecPerTick));
        idx = Array.from(sel.options).findIndex(o => parseInt(o.value, 10) >= baseTicks);
        if (idx < 0) idx = sel.options.length - 1;
      }
      sel.selectedIndex = idx;
      sel.title = '1 tura ≈ ' + CFG.marketSecPerTick + ' s czasu rynku';
      renderer.setTimeframe(parseInt(sel.value, 10));
    }
    rebuildTimeframeOptions();

    document.getElementById('marketPace').addEventListener('change', e => {
      applyPace(e.target.value);

      sim.baseCandles = []; sim._curBase = null;
      rebuildTimeframeOptions();
      applySimSpeed(parseInt(simSpeedEl.value, 10));
    });

    document.getElementById('timeframe').addEventListener('change', e => renderer.setTimeframe(parseInt(e.target.value, 10)));

    document.getElementById('chartType').addEventListener('change', e => renderer.setChartType(e.target.value));

    document.getElementById('showBook').addEventListener('change', e => renderer.setShowBook(e.target.checked));

    document.getElementById('bookMode').addEventListener('change', e => renderer.setBookMode(e.target.value));

    document.getElementById('zoomIn').addEventListener('click', () => renderer.zoom(0.7));
    document.getElementById('zoomOut').addEventListener('click', () => renderer.zoom(1.43));
    const chartWrap = document.querySelector('.chart-wrap');
    if (chartWrap) chartWrap.addEventListener('wheel', e => { e.preventDefault(); renderer.zoom(e.deltaY < 0 ? 0.85 : 1.18); }, { passive: false });

    document.getElementById('tgNoise').addEventListener('change', e => sim.enableNoise = e.target.checked);
    document.getElementById('tgTrend').addEventListener('change', e => sim.enableTrend = e.target.checked);
    document.getElementById('tgWhale').addEventListener('change', e => sim.enableWhale = e.target.checked);

    document.getElementById('orderForm').addEventListener('submit', e => {
      e.preventDefault();
      const side = document.getElementById('orderSide').value;
      const type = document.getElementById('orderType').value;
      const qty = parseInt(document.getElementById('orderQuantity').value, 10);
      if (!Number.isFinite(qty) || qty <= 0) { alert('Podaj poprawną ilość (> 0).'); return; }
      let priceCents = 0;
      if (type === 'limit') {
        const p = parseFloat(document.getElementById('orderPrice').value);
        if (!Number.isFinite(p) || p <= 0) { alert('Podaj poprawną cenę (> 0) dla zlecenia z limitem.'); return; }
        priceCents = clamp(snapToTick(Math.round(p * 100)), CFG.priceFloorCents, CFG.priceCeilCents);
      }
      const o = new Order(side, type, priceCents, qty, 0, sim.tick); o.tag = 'user';
      sim.submitUserOrder(o);
      if (!sim.running) { sim.step(); renderer.render(); }
    });

    document.getElementById('btnWhale').addEventListener('click', () => {
      const side = document.getElementById('orderSide').value;
      sim.fireWhale(side);
      if (!sim.running) { sim.step(); renderer.render(); }
    });

    renderer.render();
    start();
  } catch (err) {
    const bar = document.getElementById('errbar');
    bar.style.display = 'block';
    bar.textContent = 'Błąd inicjalizacji: ' + (err && err.stack ? err.stack : err);
    console.error(err);
  }
})();

window.addEventListener('error', e => {
  const bar = document.getElementById('errbar');
  if (bar) { bar.style.display = 'block'; bar.textContent = 'Błąd: ' + e.message + ' @ ' + e.filename + ':' + e.lineno; }
});

