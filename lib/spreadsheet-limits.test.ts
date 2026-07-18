import { describe, expect, it } from 'vitest'
import { MAX_SPREADSHEET_CELL_CHARS, MAX_SPREADSHEET_COLUMNS, validateSpreadsheetShape } from './spreadsheet-limits'

describe('spreadsheet import limits', () => {
  it('accepts a normal spreadsheet', () => {
    expect(validateSpreadsheetShape([['Name', 'Status'], ['Ada', 'Done']])).toBeNull()
  })

  it('rejects excessive column counts', () => {
    expect(validateSpreadsheetShape([Array(MAX_SPREADSHEET_COLUMNS + 1).fill('x')])).toContain('columns')
  })

  it('rejects oversized cells', () => {
    expect(validateSpreadsheetShape([['x'.repeat(MAX_SPREADSHEET_CELL_CHARS + 1)]])).toContain('cell')
  })
})
