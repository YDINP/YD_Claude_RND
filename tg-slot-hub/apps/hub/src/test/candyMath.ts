/** 테스트용 축소 캔디 math. 클러스터·연쇄·주문 카드 라운드가 스키마 검증을 통과하는 최소 형태다. */
export const miniCandyRaw = {
  id: 'mini',
  reels: 5,
  rows: 5,
  payModel: 'cluster',
  symbols: [
    { id: 'drop_red', name: { en: 'Red Drop', ko: '빨간 물방울' } },
    { id: 'heart', name: { en: 'Heart', ko: '하트' } },
    { id: 'wild', name: { en: 'Wild' }, wild: true },
    { id: 'scatter', name: { en: 'Scatter' }, scatter: true },
  ],
  strips: Array.from({ length: 5 }, () => ['drop_red', 'heart', 'drop_red', 'heart', 'drop_red', 'heart', 'wild', 'scatter']),
  cluster: { minCluster: 5, adjacency: 'orthogonal', wildJoins: true },
  cascade: { enabled: true, maxCascades: 12, refill: 'gravity', source: 'strip-pull', multiplierLadder: [1, 2, 3, 5, 8, 12, 20] },
  round: { maxWinCap: 5000 },
  paytable: { drop_red: { 5: 1, 6: 1.5 }, heart: { 5: 2, 6: 3 } },
  scatter: { symbol: 'scatter', pays: { 3: 1 } },
  orderRound: {
    trigger: 4,
    spins: 8,
    slots: 3,
    maxOrders: 6,
    extraSpinsPerOrder: 2,
    pool: [
      { id: 'pop-red-30', kind: 'popSymbol', symbol: 'drop_red', target: 30, prize: 3, weight: 1 },
      { id: 'cluster-10', kind: 'clusterSize', target: 10, prize: 8, weight: 1 },
      { id: 'chain-3', kind: 'chainLength', target: 3, prize: 5, weight: 1 },
    ],
  },
  betLevels: [20],
  rtpTarget: 0.9,
  volatility: 'high',
}
