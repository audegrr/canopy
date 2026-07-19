import { describe, expect, it } from 'vitest'
import { exceedsWebVitalBudget } from './web-vitals-budget'

describe('Web Vital budgets', () => {
  it('flags a slow LCP', () => expect(exceedsWebVitalBudget('LCP', 2_501)).toBe(true))
  it('accepts an in-budget CLS', () => expect(exceedsWebVitalBudget('CLS', 0.1)).toBe(false))
  it('ignores unknown metrics', () => expect(exceedsWebVitalBudget('UNKNOWN', 999)).toBe(false))
})
