export const WEB_VITAL_BUDGETS: Readonly<Record<string, number>> = {
  TTFB: 800,
  FCP: 1_800,
  LCP: 2_500,
  FID: 100,
  INP: 200,
  CLS: 0.1,
}

export function exceedsWebVitalBudget(name: string, value: number): boolean {
  const budget = WEB_VITAL_BUDGETS[name]
  return typeof budget === 'number' && value > budget
}
