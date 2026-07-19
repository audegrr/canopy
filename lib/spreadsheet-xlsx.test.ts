import { describe, expect, it } from 'vitest'
import { Workbook } from 'exceljs'
import { readXlsx } from './spreadsheet-xlsx'

describe('Excel workbook parsing', () => {
  it('reads values while returning formula results rather than formulas', async () => {
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet('Data')
    sheet.addRow(['Name', 'Total'])
    sheet.addRow(['Canopy', { formula: '1+1', result: 2 }])
    const buffer = await workbook.xlsx.writeBuffer()
    const arrayBuffer = Uint8Array.from(buffer as unknown as ArrayLike<number>).buffer

    await expect(readXlsx(arrayBuffer)).resolves.toEqual([
      ['Name', 'Total'],
      ['Canopy', '2'],
    ])
  })
})
