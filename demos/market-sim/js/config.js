// Konfiguracja symulacji — wszystkie parametry strojenia i profile płynności (CFG).
'use strict';

const CFG = {

  marketSecPerTick: 0.05,
  simSpeed: 60,
  maxStepsPerFrame: 1800,
  tickCents: 5,
  startPriceCents: 10000,

  mmLevels: 18,
  mmTargetDepth: 35,
  mmInnerTicks: 1,
  mmStaleMult: 3,

  PACE_PRESETS: {
    '0.05': { marketSecPerTick: 0.05, mmTargetDepth: 35, mmLevels: 18, mmInnerTicks: 1, tvpScale: 3600 },
    '0.1':  { marketSecPerTick: 0.1,  mmTargetDepth: 18, mmLevels: 13, mmInnerTicks: 1, tvpScale: 900 },
    '0.5':  { marketSecPerTick: 0.5,  mmTargetDepth: 8,  mmLevels: 8,  mmInnerTicks: 3, tvpScale: 75 },
  },

  noiseCount: 6,
  noiseActProb: 0.5,
  noiseMarketProb: 0.80,
  noiseSizeMean: 4,
  noiseMaxSize: 20,
  noiseLimitOffsetMax: 3,

  trendCount: 3,
  trendLookback: 5,
  trendPactPerCent: 0.02,
  trendPactMax: 0.6,
  trendMarketProb: 0.90,
  trendMinSize: 2, trendSizeRange: 6,

  whaleProb: 0.015,
  whaleMin: 40, whaleMax: 100,
  whaleTrendBias: 0.60,
  whaleButtonMin: 150, whaleButtonMax: 300,

  staleSeconds: 60,
  staleTicks: 1200,
  maxBookPerSide: 600,
  maxHistory: 15000,
  maxBaseCandles: 200000,
  bookProfWindow: 6000,
  maxVisibleBars: 400,
  minVisibleBars: 40,
  defaultVisibleBars: 150,
  tvpScale: 2000,

  heatmapTicks: 150,
  bookHistoryTicks: 600,
  bookNearCents: 250,
  depthBinCents: 10,

  priceFloorCents: 1000,
  priceCeilCents: 100000,
};

