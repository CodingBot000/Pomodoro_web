export const collectibles = [
  { id: 'ginkgo-tree', title: '노란 은행나무' },
  { id: 'red-mushroom', title: '빨간 버섯' },
  { id: 'snowy-peak', title: '눈 덮인 봉우리' },
  { id: 'pink-lotus', title: '분홍 연꽃' },
  { id: 'amethyst-cluster', title: '보랏빛 수정' },
  { id: 'nautilus-shell', title: '앵무조개 껍데기' },
  { id: 'sungnyemun', title: '숭례문' },
  { id: 'eiffel-tower', title: '에펠탑' },
  { id: 'leaning-tower-of-pisa', title: '피사의 사탑' },
  { id: 'taj-mahal', title: '타지마할' },
  { id: 'sydney-opera-house', title: '시드니 오페라 하우스' },
  { id: 'great-pyramid-of-giza', title: '기자의 대피라미드' },
] as const

export type CollectibleId = (typeof collectibles)[number]['id']
